package com.nextgensystems.mhambi.engine

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Pure (Android-free) helpers that drive the config-based screens.
 * They mirror website/js/ui.js so web and Android show the same values.
 */
object Logic {

    /** Reads a dotted path such as "assignment.driverName" from a JSON object. Returns null when any part is missing/null. */
    fun get(root: JsonElement?, path: String): JsonElement? {
        var cur: JsonElement? = root
        for (part in path.split(".")) {
            if (cur == null || cur.isJsonNull || !cur.isJsonObject) return null
            cur = cur.asJsonObject.get(part)
        }
        return if (cur == null || cur.isJsonNull) null else cur
    }

    fun text(el: JsonElement?): String? {
        if (el == null || el.isJsonNull) return null
        return if (el.isJsonPrimitive) el.asString else el.toString()
    }

    /** Replaces {field} placeholders with values from [row]; missing values become empty text. */
    fun tpl(template: String, row: JsonObject?): String =
        Regex("\\{(\\w+)\\}").replace(template) { m -> text(row?.get(m.groupValues[1])) ?: "" }

    private fun sameValue(expected: JsonElement, actual: JsonElement?): Boolean {
        if (actual == null || actual.isJsonNull || !expected.isJsonPrimitive || !actual.isJsonPrimitive) return false
        val e = expected.asJsonPrimitive
        val a = actual.asJsonPrimitive
        return when {
            e.isBoolean && a.isBoolean -> e.asBoolean == a.asBoolean
            e.isNumber && a.isNumber -> e.asDouble == a.asDouble
            e.isString && a.isString -> e.asString == a.asString
            else -> false
        }
    }

    /** True when every key in [conditions] has a value in the allowed list (all conditions must hold). */
    fun matches(row: JsonObject, conditions: Map<String, List<JsonElement>>?): Boolean {
        if (conditions.isNullOrEmpty()) return true
        return conditions.all { (key, allowed) ->
            val actual = get(row, key)
            allowed.any { sameValue(it, actual) }
        }
    }

    /** "partially_paid" -> "Partially paid" */
    fun label(s: String?): String {
        if (s.isNullOrBlank()) return ""
        val t = s.replace(Regex("[_-]+"), " ")
        return t.substring(0, 1).uppercase(Locale.ROOT) + t.substring(1)
    }

    /** South African Rand, e.g. R 13 800,00 (deterministic: does not depend on the device locale data). */
    fun money(amount: Double): String {
        val negative = amount < 0
        val cents = Math.round(Math.abs(amount) * 100.0)
        val whole = (cents / 100).toString()
        val frac = (cents % 100).toString().padStart(2, '0')
        val grouped = StringBuilder()
        whole.reversed().forEachIndexed { i, c ->
            if (i > 0 && i % 3 == 0) grouped.append(' ')
            grouped.append(c)
        }
        return (if (negative) "-R " else "R ") + grouped.reverse().toString() + "," + frac
    }

    fun number(value: Double): String {
        val whole = Math.round(value)
        return if (Math.abs(value - whole) < 0.0000001) group(whole.toString()) else value.toString()
    }

    private fun group(digits: String): String {
        val neg = digits.startsWith("-")
        val d = digits.removePrefix("-")
        val sb = StringBuilder()
        d.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(' '); sb.append(c) }
        return (if (neg) "-" else "") + sb.reverse().toString()
    }

    fun date(iso: String?): String = if (iso.isNullOrBlank()) "" else iso.take(10)

    /** Server timestamps are UTC ISO-8601; show them in the device time zone as yyyy-MM-dd HH:mm. */
    fun datetime(iso: String?, zone: TimeZone = TimeZone.getDefault()): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT)
            parser.timeZone = TimeZone.getTimeZone("UTC")
            val d = parser.parse(iso.take(19)) ?: return iso
            val out = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT)
            out.timeZone = zone
            out.format(d)
        } catch (e: Exception) {
            iso
        }
    }

    const val EMPTY = "\u2014"

    /** Plain-text version of a table cell, matching the website's formatting rules. */
    fun cell(type: String?, value: JsonElement?, row: JsonObject, field: String): String {
        if (type == "route") {
            val parts = field.split("|")
            return (text(row.get(parts[0])) ?: EMPTY) + " \u2192 " + (text(row.get(parts.getOrElse(1) { "" })) ?: EMPTY)
        }
        if (value == null || value.isJsonNull) return EMPTY
        val raw = text(value) ?: return EMPTY
        if (raw.isEmpty()) return EMPTY
        return when (type) {
            "money" -> money(value.asDouble)
            "date" -> date(raw)
            "datetime" -> datetime(raw)
            "number" -> number(value.asDouble)
            "kg" -> number(value.asDouble) + " kg"
            "km" -> number(value.asDouble) + " km"
            "bool" -> if (value.asBoolean) "Yes" else "No"
            "lowstock" -> if (value.asBoolean) "Low stock" else "OK"
            "count" -> if (value.isJsonArray) value.asJsonArray.size().toString() else raw
            "status" -> label(raw)
            else -> raw
        }
    }

    /** Builds the Google Maps directions link for navigate actions. */
    fun mapsUrl(row: JsonObject, field: String, originField: String?): String {
        val enc = { s: String -> java.net.URLEncoder.encode(s, "UTF-8") }
        val dest = enc(text(row.get(field)) ?: "")
        val origin = if (originField != null && text(row.get(originField)) != null) "&origin=" + enc(text(row.get(originField))!!) else ""
        return "https://www.google.com/maps/dir/?api=1&destination=$dest$origin&travelmode=driving"
    }

    /** Colour group used for status badges: good / warn / bad. */
    fun statusGroup(value: String?): String {
        val k = (value ?: "").lowercase(Locale.ROOT).replace('_', '-')
        val good = setOf("delivered", "completed", "paid", "approved", "active", "resolved", "available", "accepted", "converted", "received", "closed", "success", "eft")
        val bad = setOf("failed", "cancelled", "overdue", "rejected", "declined", "inactive", "retired", "urgent", "critical", "theft", "accident", "high", "error", "suspended")
        return when {
            k in good -> "good"
            k in bad -> "bad"
            else -> "warn"
        }
    }

    /** Normalises a server address typed by a person into "https://host/api/v1/". Returns null if it is not a usable http(s) address. */
    fun normalizeBaseUrl(input: String): String? {
        var s = input.trim()
        if (!(s.startsWith("http://") || s.startsWith("https://"))) return null
        val rest = s.substringAfter("://")
        if (rest.isBlank() || rest.startsWith("/") || rest.contains(" ")) return null
        s = s.trimEnd('/')
        if (!s.endsWith("/api/v1")) s += "/api/v1"
        return "$s/"
    }

    /** Converts "2026-12-02T08:30" (device local time) to a UTC ISO string for the API. */
    fun localToIso(local: String, zone: TimeZone = TimeZone.getDefault()): String? {
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.ROOT)
            parser.timeZone = zone
            val d = parser.parse(local) ?: return null
            val out = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT)
            out.timeZone = TimeZone.getTimeZone("UTC")
            out.format(d)
        } catch (e: Exception) {
            null
        }
    }

    /** Parses typed numbers. Whole numbers come back as Long so ids are sent as 5, not 5.0. Returns null for invalid text. */
    fun numberValue(text: String): Number? {
        val t = text.trim().replace(',', '.')
        if (t.isEmpty()) return null
        val d = t.toDoubleOrNull() ?: return null
        if (d.isNaN() || d.isInfinite()) return null
        return if (d % 1.0 == 0.0 && Math.abs(d) < 1e15) d.toLong() else d
    }
}
