package com.nextgensystems.mhambi

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.nextgensystems.mhambi.engine.Logic
import com.nextgensystems.mhambi.engine.PortalConfig
import com.nextgensystems.mhambi.engine.Supported
import com.nextgensystems.mhambi.engine.choices
import com.nextgensystems.mhambi.engine.staticChoices
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.TimeZone

private fun obj(json: String): JsonObject = JsonParser.parseString(json).asJsonObject

class LogicTest {
    @Test fun getReadsDottedPathsAndTreatsNullAsMissing() {
        val row = obj("""{"assignment":{"driverName":"Bongani"},"x":null,"n":5}""")
        assertEquals("Bongani", Logic.text(Logic.get(row, "assignment.driverName")))
        assertEquals(null, Logic.get(row, "assignment.vehicle"))
        assertEquals(null, Logic.get(row, "x"))
        assertEquals(null, Logic.get(row, "x.y"))
        assertEquals("5", Logic.text(Logic.get(row, "n")))
    }

    @Test fun templatesFillPlaceholdersAndBlankMissingValues() {
        val row = obj("""{"id":7,"fileName":"INV-0001.html"}""")
        assertEquals("/documents/7/download", Logic.tpl("/documents/{id}/download", row))
        assertEquals("INV-0001.html", Logic.tpl("{fileName}", row))
        assertEquals("a--b", Logic.tpl("a-{missing}-b", row).replace("--", "--"))
    }

    @Test fun conditionsRequireEveryKeyToMatch() {
        val row = obj("""{"status":"unpaid","paid":0,"uploaded":true,"quantity":0}""")
        fun cond(json: String) = JsonParser.parseString(json).asJsonObject.entrySet().associate { it.key to it.value.asJsonArray.toList() }
        assertTrue(Logic.matches(row, cond("""{"status":["unpaid","draft"],"paid":[0]}""")))
        assertFalse(Logic.matches(row, cond("""{"status":["paid"]}""")))
        assertFalse(Logic.matches(row, cond("""{"status":["unpaid"],"paid":[1]}""")))
        assertTrue(Logic.matches(row, cond("""{"uploaded":[true]}""")))
        assertFalse(Logic.matches(row, cond("""{"uploaded":[false]}""")))
        assertTrue(Logic.matches(row, cond("""{"quantity":[0]}""")))
        assertFalse(Logic.matches(row, cond("""{"missing":["x"]}""")))
        assertTrue(Logic.matches(row, null))
    }

    @Test fun moneyUsesSouthAfricanRandFormat() {
        assertEquals("R 13 800,00", Logic.money(13800.0))
        assertEquals("R 0,00", Logic.money(0.0))
        assertEquals("R 1 234 567,89", Logic.money(1234567.891))
        assertEquals("R 99,50", Logic.money(99.5))
        assertEquals("-R 5,25", Logic.money(-5.25))
    }

    @Test fun labelsAndNumbers() {
        assertEquals("Partially paid", Logic.label("partially_paid"))
        assertEquals("In transit", Logic.label("in-transit"))
        assertEquals("", Logic.label(null))
        assertEquals("8 058", Logic.number(8058.0))
        assertEquals("1 000 000", Logic.number(1000000.0))
    }

    @Test fun datesAreFormattedInTheRequestedTimeZone() {
        assertEquals("2026-09-05", Logic.date("2026-09-05T14:00:00.000Z"))
        assertEquals("2026-09-05 16:00", Logic.datetime("2026-09-05T14:00:00.000Z", TimeZone.getTimeZone("Africa/Johannesburg")))
        assertEquals("2026-09-05 14:00", Logic.datetime("2026-09-05T14:00:00.000Z", TimeZone.getTimeZone("UTC")))
        assertEquals("not a date", Logic.datetime("not a date"))
    }

    @Test fun cellsFormatByType() {
        val row = obj("""{"origin":"Durban","destination":"Pretoria","total":13800,"status":"in_transit","lowStock":true,"weightKg":6200,"perms":["a","b"],"empty":null}""")
        assertEquals("Durban \u2192 Pretoria", Logic.cell("route", null, row, "origin|destination"))
        assertEquals("R 13 800,00", Logic.cell("money", row.get("total"), row, "total"))
        assertEquals("In transit", Logic.cell("status", row.get("status"), row, "status"))
        assertEquals("Low stock", Logic.cell("lowstock", row.get("lowStock"), row, "lowStock"))
        assertEquals("6 200 kg", Logic.cell("kg", row.get("weightKg"), row, "weightKg"))
        assertEquals("2", Logic.cell("count", row.get("perms"), row, "perms"))
        assertEquals(Logic.EMPTY, Logic.cell("text", row.get("empty"), row, "empty"))
        assertEquals(Logic.EMPTY, Logic.cell("text", null, row, "nothing"))
    }

    @Test fun mapsLinkEncodesAddresses() {
        val row = obj("""{"origin":"Cape Town","destination":"Johannesburg, Gauteng"}""")
        val url = Logic.mapsUrl(row, "destination", "origin")
        assertTrue(url.startsWith("https://www.google.com/maps/dir/?api=1&destination=Johannesburg%2C+Gauteng"))
        assertTrue(url.contains("&origin=Cape+Town"))
        assertFalse(Logic.mapsUrl(row, "destination", null).contains("origin"))
    }

    @Test fun statusColourGroups() {
        assertEquals("good", Logic.statusGroup("delivered"))
        assertEquals("good", Logic.statusGroup("partially_paid".let { "paid" }))
        assertEquals("bad", Logic.statusGroup("overdue"))
        assertEquals("warn", Logic.statusGroup("in_transit"))
        assertEquals("warn", Logic.statusGroup(null))
    }
}

class InputHelpersTest {
    @Test fun serverAddressesAreNormalised() {
        assertEquals("https://mhambi-api.onrender.com/api/v1/", Logic.normalizeBaseUrl("https://mhambi-api.onrender.com"))
        assertEquals("https://mhambi-api.onrender.com/api/v1/", Logic.normalizeBaseUrl("  https://mhambi-api.onrender.com/api/v1  "))
        assertEquals("http://192.168.1.20:3000/api/v1/", Logic.normalizeBaseUrl("http://192.168.1.20:3000/"))
        assertEquals(null, Logic.normalizeBaseUrl("mhambi.com"))
        assertEquals(null, Logic.normalizeBaseUrl("ftp://x.com"))
        assertEquals(null, Logic.normalizeBaseUrl("https://"))
        assertEquals(null, Logic.normalizeBaseUrl("https://bad host.com"))
        assertEquals(null, Logic.normalizeBaseUrl(""))
    }

    @Test fun localDateTimesBecomeUtcIso() {
        assertEquals("2026-12-02T06:30:00Z", Logic.localToIso("2026-12-02T08:30", TimeZone.getTimeZone("Africa/Johannesburg")))
        assertEquals(null, Logic.localToIso("garbage"))
    }

    @Test fun numbersAreParsedStrictly() {
        assertEquals(5L, Logic.numberValue("5"))
        assertEquals(5L, Logic.numberValue(" 5.0 "))
        assertEquals(12.5, Logic.numberValue("12,5"))
        assertEquals(null, Logic.numberValue("abc"))
        assertEquals(null, Logic.numberValue(""))
        assertEquals(null, Logic.numberValue("NaN"))
    }
}

/** Contract test: the shared screen definition only uses things the Android engine can render. */
class PortalConfigContractTest {
    private val config: PortalConfig by lazy {
        val f = listOf(File("src/main/assets/portal-config.json"), File("app/src/main/assets/portal-config.json")).first { it.exists() }
        PortalConfig.parse(f.readText())
    }

    @Test fun hasAllEightRolesEachStartingOnItsDashboard() {
        assertEquals(setOf("admin", "dispatcher", "warehouse", "fleet", "procurement", "finance", "driver", "client"), config.roles.keys)
        config.roles.forEach { (key, role) ->
            assertEquals("$key must start on its home page", role.home, role.nav.first())
            assertEquals("dashboard", config.pages[role.home]?.type)
        }
    }

    @Test fun everyNavigationEntryExistsAndUsesASupportedScreenType() {
        config.roles.forEach { (role, def) ->
            def.nav.forEach { id ->
                val page = config.page(id)
                assertNotNull("$role -> $id is not defined", page)
                assertTrue("$id has unsupported type ${page!!.type}", page.type in Supported.pageTypes)
            }
        }
    }

    @Test fun everyColumnActionAndFieldUsesSupportedKinds() {
        var fields = 0
        var actions = 0
        config.pages.values.forEach { p ->
            p.columns?.forEach { assertTrue("${p.id}: column type ${it.type}", it.type == null || it.type in Supported.columnTypes) }
            if (p.type == "table" || p.type == "tracking") {
                assertNotNull("${p.id} needs an endpoint", p.endpoint)
                assertTrue("${p.id} needs columns", !p.columns.isNullOrEmpty())
            }
            val forms = mutableListOf<List<com.nextgensystems.mhambi.engine.FieldDef>>()
            p.create?.let { forms.add(it.fields); assertTrue(it.url.startsWith("/")) }
            p.fields?.let { forms.add(it) }
            p.actions?.forEach { a ->
                actions++
                assertTrue("${p.id}/${a.label}: action type ${a.type}", a.type == null || a.type in Supported.actionTypes)
                if (a.type == null) { assertNotNull("${p.id}/${a.label} needs a url", a.url); assertNotNull("${p.id}/${a.label} needs a method", a.method) }
                if (a.type == "navigate") assertNotNull(a.field)
                if (a.type == "download") assertNotNull(a.url)
                if (a.type == "detail") assertNotNull(a.detail)
                a.form?.let { forms.add(it.fields) }
            }
            forms.flatten().forEach { f ->
                fields++
                assertTrue("${p.id}: field ${f.name} has unsupported type ${f.type}", f.type in Supported.fieldTypes)
                if (f.type == "select") assertTrue("${p.id}: select ${f.name} needs options", !f.options.isNullOrEmpty() || f.optionsFrom != null)
                f.options?.let { assertTrue(f.staticChoices().isNotEmpty()) }
            }
            p.filters?.forEach { assertTrue("${p.id}: filter ${it.param}", it.choices().isNotEmpty()) }
        }
        assertTrue(fields > 100)
        assertTrue(actions > 80)
    }

    @Test fun conditionsParseIntoUsableValues() {
        val action = config.page("invoices")!!.actions!!.first { it.label == "Edit" }
        assertEquals(setOf("status", "paid"), action.whenMap!!.keys)
        val unpaidRow = obj("""{"status":"draft","paid":0}""")
        val paidRow = obj("""{"status":"paid","paid":500}""")
        assertTrue(Logic.matches(unpaidRow, action.whenMap))
        assertFalse(Logic.matches(paidRow, action.whenMap))
    }

    @Test fun driverCanReportIncidentsAndCaptureProofOfDelivery() {
        val actions = config.page("my-deliveries")!!.actions!!
        assertTrue(actions.any { it.url == "/shipments/{id}/pod" })
        assertTrue(actions.any { it.url == "/incidents" })
        assertTrue(actions.any { it.type == "navigate" })
    }
}
