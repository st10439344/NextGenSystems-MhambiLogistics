package com.nextgensystems.mhambi.ui

import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.nextgensystems.mhambi.BuildConfig
import com.nextgensystems.mhambi.Graph
import com.nextgensystems.mhambi.data.User
import com.nextgensystems.mhambi.engine.ActionDef
import com.nextgensystems.mhambi.engine.FieldDef
import com.nextgensystems.mhambi.engine.Logic
import com.nextgensystems.mhambi.engine.PageDef
import com.nextgensystems.mhambi.engine.choices
import com.nextgensystems.mhambi.ui.theme.ErrorRed
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URLEncoder

private fun field(name: String, label: String, type: String = "text", required: Boolean = false, options: List<String>? = null, from: String? = null): FieldDef =
    FieldDef(name, label, type, required, null, from, options?.map { com.google.gson.JsonPrimitive(it) }, null, null, null, null)

private val MONEY_COLUMN = Regex("(?i)(cost|value|invoiced|collected|total|amount|spend)")

private fun JsonElement?.objs(): List<JsonObject> =
    if (this != null && this.isJsonArray) this.asJsonArray.filter { it.isJsonObject }.map { it.asJsonObject } else emptyList()

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier, shape = RoundedCornerShape(14.dp), elevation = CardDefaults.cardElevation(2.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/* ============================ Dashboard ============================ */
@Composable
fun DashboardPage(role: String, onNavigate: (String) -> Unit) {
    val holder = loadState(role) { Graph.api.request("GET", "/dashboard").asJsonObject }
    when (val st = holder.state) {
        is Load.Loading -> LoadingBox()
        is Load.Err -> ErrorBox(st.message, holder.reload)
        is Load.Ok -> {
            val d = st.value
            val cards = d.get("cards").objs()
            val recent = d.getAsJsonObject("recent")
            val def = Graph.config.role(role)
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                cards.chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { c ->
                            val v = c.get("value").asDouble
                            val shown = if (c.get("kind")?.asString == "currency") Logic.money(v) else Logic.number(v)
                            StatCard(c.get("label").asString, shown, Modifier.weight(1f))
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                if (recent != null) {
                    SectionTitle(recent.get("title").asString)
                    val items = recent.get("items").objs()
                    if (items.isEmpty()) EmptyBox("Nothing to show yet")
                    items.forEach { i ->
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                Text(Logic.text(i.get("title")) ?: "", fontWeight = FontWeight.Bold)
                                Text(Logic.text(i.get("subtitle")) ?: "", style = MaterialTheme.typography.bodySmall)
                                Text(Logic.datetime(Logic.text(i.get("at"))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                SectionTitle("Go to")
                def?.nav?.filter { it != def.home && it != "notifications" && it != "profile" }?.forEach { id ->
                    val p = Graph.config.page(id)
                    if (p != null) OutlinedButton(onClick = { onNavigate(id) }, modifier = Modifier.fillMaxWidth()) { Text(p.title) }
                }
                TextButton(onClick = holder.reload) { Text("Refresh figures") }
            }
        }
    }
}

/* ============================ Tables ============================ */
private sealed interface Dlg {
    data class Form(val action: ActionDef, val row: JsonObject) : Dlg
    data class Confirm(val action: ActionDef, val row: JsonObject) : Dlg
    data class Detail(val action: ActionDef, val row: JsonObject) : Dlg
    object Create : Dlg
    data class UploadTitle(val name: String, val mime: String, val base64: String) : Dlg
}

private suspend fun fetchRows(page: PageDef, search: String, filters: Map<String, String>): List<JsonObject> {
    val q = LinkedHashMap<String, String>()
    page.params?.let { q.putAll(it) }
    if (search.isNotBlank()) q[page.searchParam ?: "q"] = search
    filters.forEach { (k, v) -> if (v.isNotBlank()) q[k] = v }
    if (!q.containsKey("limit")) q["limit"] = "200"
    val qs = q.entries.joinToString("&") { URLEncoder.encode(it.key, "UTF-8") + "=" + URLEncoder.encode(it.value, "UTF-8") }
    val json = Graph.api.request("GET", page.endpoint + "?" + qs)
    val rows = Logic.get(json, page.dataPath ?: "data").objs()
    return if (page.filterRows != null) rows.filter { Logic.matches(it, page.filterRows) } else rows
}

private suspend fun performAction(a: ActionDef, row: JsonObject, values: JsonObject?) {
    val body = JsonObject()
    a.body?.entrySet()?.forEach { body.add(it.key, it.value) }
    a.bodyFromRow?.forEach { (k, src) -> Logic.get(row, src)?.let { body.add(k, it) } }
    values?.entrySet()?.forEach { body.add(it.key, it.value) }
    val method = (a.method ?: "POST").uppercase()
    Graph.api.request(method, Logic.tpl(a.url ?: "", row), if (method == "DELETE") null else body)
}

@Composable
fun TablePage(page: PageDef, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var search by rememberSaveable(page.id) { mutableStateOf("") }
    var debounced by remember(page.id) { mutableStateOf("") }
    val filters = remember(page.id) { mutableStateMapOf<String, String>() }
    var dlg by remember(page.id) { mutableStateOf<Dlg?>(null) }

    LaunchedEffect(search) { delay(300); debounced = search }
    val holder = loadState(page.id, debounced, filters.toMap()) { fetchRows(page, debounced, filters.toMap()) }

    fun done(label: String) { toast(context, "$label: done."); holder.reload() }

    fun handle(a: ActionDef, row: JsonObject) {
        when {
            a.type == "navigate" -> openUrl(context, Logic.mapsUrl(row, a.field ?: "destination", a.originField))
            a.type == "download" -> scope.launch {
                try {
                    val f = Graph.api.download(Logic.tpl(a.url ?: "", row), Logic.tpl(a.filename ?: "download", row))
                    shareFile(context, f)
                } catch (e: Exception) { toast(context, errorText(e)) }
            }
            a.type == "detail" -> dlg = Dlg.Detail(a, row)
            a.form != null -> dlg = Dlg.Form(a, row)
            a.confirm != null -> dlg = Dlg.Confirm(a, row)
            else -> scope.launch {
                try { performAction(a, row, null); done(a.label) } catch (e: Exception) { toast(context, errorText(e)) }
            }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) scope.launch {
            val picked = withContext(Dispatchers.IO) {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                val name = context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    if (c.moveToFirst()) { val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (i >= 0) c.getString(i) else null } else null
                }
                Triple(bytes, name ?: "document", context.contentResolver.getType(uri) ?: "application/octet-stream")
            }
            val bytes = picked.first
            when {
                bytes == null || bytes.isEmpty() -> toast(context, "That file could not be read.")
                bytes.size > 2 * 1024 * 1024 -> toast(context, "That file is larger than 2 MB.")
                else -> dlg = Dlg.UploadTitle(picked.second, picked.third, Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
        }
    }

    Column(modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            page.subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (page.showSearch) {
                OutlinedTextField(
                    value = search, onValueChange = { search = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(page.searchLabel ?: "Search\u2026") }, leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) }
                )
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                page.filters.orEmpty().forEach { f ->
                    var open by remember { mutableStateOf(false) }
                    val current = filters[f.param].orEmpty()
                    val shown = f.choices().firstOrNull { it.value == current }?.label
                    OutlinedButton(onClick = { open = true }) { Text(if (shown != null) "${f.label}: $shown" else "All ${f.label.lowercase()}") }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        DropdownMenuItem(text = { Text("All ${f.label.lowercase()}") }, onClick = { filters.remove(f.param); open = false })
                        f.choices().forEach { c -> DropdownMenuItem(text = { Text(c.label) }, onClick = { filters[f.param] = c.value; open = false }) }
                    }
                }
                if (search.isNotBlank() || filters.isNotEmpty()) TextButton(onClick = { search = ""; filters.clear() }) { Text("Clear") }
                page.create?.let { c -> Button(onClick = { dlg = Dlg.Create }) { Icon(Icons.Filled.Add, contentDescription = null); Spacer(Modifier.size(6.dp)); Text(c.label) } }
                page.upload?.let { u -> Button(onClick = { picker.launch("*/*") }) { Icon(Icons.Filled.Upload, contentDescription = null); Spacer(Modifier.size(6.dp)); Text(u.label) } }
                page.export?.let { e ->
                    OutlinedButton(onClick = {
                        scope.launch {
                            try { shareFile(context, Graph.api.download(e.url, e.filename ?: "export.csv")) } catch (ex: Exception) { toast(context, errorText(ex)) }
                        }
                    }) { Icon(Icons.Filled.Download, contentDescription = null); Spacer(Modifier.size(6.dp)); Text(e.label) }
                }
            }
        }
        when (val st = holder.state) {
            is Load.Loading -> LoadingBox()
            is Load.Err -> ErrorBox(st.message, holder.reload)
            is Load.Ok -> {
                if (st.value.isEmpty()) EmptyBox("No records found", if (search.isNotBlank() || filters.isNotEmpty()) "Try a different search or clear the filters." else "Records will appear here as they are created.")
                else LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(st.value) { row -> RowCard(page, row) { a -> handle(a, row) } }
                }
            }
        }
    }

    when (val d = dlg) {
        is Dlg.Create -> {
            val c = page.create!!
            FormDialog(c.title, c.fields, null, c.label, onSubmit = { v -> Graph.api.request(c.method ?: "POST", c.url, v) }, onDismiss = { dlg = null }, onSuccess = { dlg = null; done(c.label) })
        }
        is Dlg.Form -> FormDialog(d.action.form!!.title, d.action.form.fields, d.row, d.action.label,
            onSubmit = { v -> performAction(d.action, d.row, v) }, onDismiss = { dlg = null }, onSuccess = { dlg = null; done(d.action.label) })
        is Dlg.Confirm -> ConfirmDialog(Logic.tpl(d.action.confirm ?: "Are you sure?", d.row), d.action.label, d.action.danger == true,
            onConfirm = {
                dlg = null
                scope.launch { try { performAction(d.action, d.row, null); done(d.action.label) } catch (e: Exception) { toast(context, errorText(e)) } }
            }, onDismiss = { dlg = null })
        is Dlg.Detail -> DetailDialog(d.action, d.row) { dlg = null }
        is Dlg.UploadTitle -> FormDialog("Upload ${d.name}", listOf(field("title", "Document title", required = true)), null, "Upload",
            onSubmit = { v ->
                val body = JsonObject()
                body.addProperty("title", v.get("title").asString)
                body.addProperty("type", "other")
                body.addProperty("fileName", d.name)
                body.addProperty("mimeType", d.mime)
                body.addProperty("contentBase64", d.base64)
                Graph.api.request("POST", page.upload?.url ?: "/documents", body)
            }, onDismiss = { dlg = null }, onSuccess = { dlg = null; done("Upload") })
        null -> {}
    }
}

@Composable
private fun RowCard(page: PageDef, row: JsonObject, onAction: (ActionDef) -> Unit) {
    val cols = page.columns.orEmpty()
    val first = cols.firstOrNull()
    val statusCol = cols.lastOrNull { it.type == "status" && it !== first }
    val visible = page.actions.orEmpty().filter { Logic.matches(row, it.whenMap) }
    fun value(c: com.nextgensystems.mhambi.engine.ColumnDef): String = Logic.cell(c.type, Logic.get(row, c.field.split("|")[0]), row, c.field)
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), elevation = CardDefaults.cardElevation(2.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(if (first != null) value(first) else "", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                if (statusCol != null) StatusBadge(Logic.text(Logic.get(row, statusCol.field)))
            }
            cols.drop(1).filter { it !== statusCol }.forEach { c ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(c.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.38f))
                    if (c.type == "status") Row(Modifier.weight(0.62f)) { StatusBadge(Logic.text(Logic.get(row, c.field))) }
                    else Text(value(c), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(0.62f))
                }
            }
            if (visible.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    visible.forEach { a ->
                        AssistChip(
                            onClick = { onAction(a) },
                            label = { Text(a.label) },
                            leadingIcon = { Icon(iconFor(a.icon), contentDescription = null, modifier = Modifier.size(18.dp), tint = if (a.danger == true) ErrorRed else MaterialTheme.colorScheme.primary) },
                            colors = AssistChipDefaults.assistChipColors(labelColor = if (a.danger == true) ErrorRed else MaterialTheme.colorScheme.onSurface)
                        )
                    }
                }
            }
        }
    }
}

/* ============================ Tracking ============================ */
@Composable
fun TrackingPage(page: PageDef) {
    val scope = rememberCoroutineScope()
    var ref by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var found by remember { mutableStateOf<JsonObject?>(null) }
    val detailAction = page.actions.orEmpty().firstOrNull { it.type == "detail" }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(page.subtitle ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ErrorBanner(error)
            OutlinedTextField(ref, { ref = it }, singleLine = true, label = { Text("Tracking reference (MHM-000123)") }, modifier = Modifier.fillMaxWidth())
            Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                error = null
                val r = ref.trim().uppercase()
                if (!Regex("^MHM-\\d{6}$").matches(r)) { error = "Tracking references look like MHM-000123."; return@Button }
                busy = true
                scope.launch {
                    try {
                        val json = Graph.api.request("GET", "/shipments?q=" + URLEncoder.encode(r, "UTF-8"))
                        val hit = Logic.get(json, "data").objs().firstOrNull { Logic.text(it.get("trackingRef")) == r }
                        if (hit == null) error = "No shipment with that reference was found on your account." else found = hit
                    } catch (e: Exception) { error = errorText(e) }
                    busy = false
                }
            }) { Text(if (busy) "Looking up\u2026" else "Track shipment") }
        }
        TablePage(page.copy(title = "Your shipments", search = true, filters = emptyList(), subtitle = null), Modifier.weight(1f))
    }
    val f = found
    if (f != null && detailAction != null) DetailDialog(detailAction, f) { found = null }
}

/* ============================ Reports ============================ */
@Composable
fun ReportsPage(page: PageDef) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tabs = page.reports.orEmpty()
    var index by rememberSaveable(page.id) { mutableStateOf(0) }
    if (tabs.isEmpty()) { ErrorBox("No reports are configured for this page.", null); return }
    val name = tabs[index][0]
    val holder = loadState(name) { Graph.api.request("GET", "/reports/$name").asJsonObject }
    Column(Modifier.fillMaxSize()) {
        if (tabs.size > 1) {
            ScrollableTabRow(selectedTabIndex = index, edgePadding = 8.dp) {
                tabs.forEachIndexed { i, t -> Tab(selected = i == index, onClick = { index = i }, text = { Text(t[1]) }) }
            }
        }
        when (val st = holder.state) {
            is Load.Loading -> LoadingBox()
            is Load.Err -> ErrorBox(st.message, holder.reload)
            is Load.Ok -> {
                val r = st.value
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(r.get("title").asString, style = MaterialTheme.typography.titleLarge)
                    Text("Generated " + Logic.datetime(Logic.text(r.get("generatedAt"))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    r.get("summary").objs().chunked(2).forEach { pair ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            pair.forEach { s ->
                                val v = s.get("value").asDouble
                                StatCard(s.get("label").asString, if (s.get("kind")?.asString == "currency") Logic.money(v) else Logic.number(v), Modifier.weight(1f))
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                    r.get("tables").objs().forEachIndexed { ti, t ->
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(t.get("name").asString, fontWeight = FontWeight.Bold)
                                    TextButton(onClick = {
                                        scope.launch {
                                            try { shareFile(context, Graph.api.download("/reports/$name?format=csv&table=$ti", "$name-report-$ti.csv")) } catch (e: Exception) { toast(context, errorText(e)) }
                                        }
                                    }) { Icon(Icons.Filled.Download, contentDescription = null, modifier = Modifier.size(18.dp)); Spacer(Modifier.size(4.dp)); Text("CSV") }
                                }
                                val cols = t.get("columns").asJsonArray.map { it.asString }
                                val rows = t.get("rows").objs()
                                if (rows.isEmpty()) Text("No data.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                rows.forEach { row ->
                                    Text(cols.joinToString("  \u00B7  ") { c ->
                                        val txt = Logic.text(row.get(c)) ?: ""
                                        val num = txt.toDoubleOrNull()
                                        when {
                                            num != null && MONEY_COLUMN.containsMatchIn(c) -> Logic.money(num)
                                            num != null -> Logic.number(num)
                                            else -> txt
                                        }
                                    }, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ============================ Notifications ============================ */
@Composable
fun NotificationsPage(role: String, onUnreadChanged: (Int) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val holder = loadState(role) { Graph.api.request("GET", "/notifications?limit=100").asJsonObject }
    var open by remember { mutableStateOf<JsonObject?>(null) }
    var send by remember { mutableStateOf(false) }

    when (val st = holder.state) {
        is Load.Loading -> LoadingBox()
        is Load.Err -> ErrorBox(st.message, holder.reload)
        is Load.Ok -> {
            val unread = st.value.get("unreadCount")?.asInt ?: 0
            LaunchedEffect(unread) { onUnreadChanged(unread) }
            val items = st.value.get("data").objs()
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("$unread unread", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(enabled = unread > 0, onClick = {
                        scope.launch { try { Graph.api.request("POST", "/notifications/read-all", JsonObject()); holder.reload() } catch (e: Exception) { toast(context, errorText(e)) } }
                    }) { Text("Mark all read") }
                    if (role == "admin") Button(onClick = { send = true }) { Text("Send") }
                }
                if (items.isEmpty()) EmptyBox("No notifications", "You are all caught up.")
                else LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(items) { n ->
                        val isRead = n.get("read")?.asBoolean == true
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = if (isRead) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.secondary.copy(alpha = 0.16f))) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    TextButton(onClick = {
                                        open = n
                                        if (!isRead) scope.launch { try { Graph.api.request("PATCH", "/notifications/${n.get("id").asLong}/read", JsonObject()); holder.reload() } catch (e: Exception) { /* shown on reload */ } }
                                    }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                        Column(Modifier.fillMaxWidth()) {
                                            Text(Logic.text(n.get("title")) ?: "", fontWeight = if (isRead) FontWeight.Normal else FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                            Text(Logic.text(n.get("message")) ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                                            Text(Logic.datetime(Logic.text(n.get("createdAt"))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }
                                IconButton(onClick = {
                                    scope.launch { try { Graph.api.request("DELETE", "/notifications/${n.get("id").asLong}"); holder.reload() } catch (e: Exception) { toast(context, errorText(e)) } }
                                }) { Icon(Icons.Filled.Delete, contentDescription = "Delete notification", tint = ErrorRed) }
                            }
                        }
                    }
                }
            }
        }
    }
    open?.let { n ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { open = null },
            title = { Text(Logic.text(n.get("title")) ?: "") },
            text = { Column { Text(Logic.text(n.get("message")) ?: ""); Spacer(Modifier.size(8.dp)); Text(Logic.datetime(Logic.text(n.get("createdAt"))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
            confirmButton = { TextButton(onClick = { open = null }) { Text("Close") } }
        )
    }
    if (send) {
        FormDialog("Send a notification", listOf(
            field("role", "Send to role", "select", true, listOf("admin", "dispatcher", "warehouse", "fleet", "procurement", "finance", "driver", "client")),
            field("title", "Title", required = true), field("message", "Message", "textarea", true),
            field("type", "Type", "select", false, listOf("info", "success", "warning", "error"))
        ), null, "Send", onSubmit = { v -> Graph.api.request("POST", "/notifications", v) }, onDismiss = { send = false }, onSuccess = { send = false; toast(context, "Notification sent."); holder.reload() })
    }
}

/* ============================ Profile & settings ============================ */
@Composable
fun ProfilePage(user: User, onLogout: () -> Unit, onThemeChange: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val userRow = remember(user) { Gson().toJsonTree(user).asJsonObject }
    val prefs = loadState(user.id) { Graph.api.request("GET", "/settings/me").asJsonObject.getAsJsonObject("settings") }
    var confirmAll by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Your details", style = MaterialTheme.typography.titleMedium)
                Text("${user.email} \u00B7 ${Graph.config.role(user.role)?.title ?: user.role}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                InlineForm(listOf(field("fullName", "Full name", required = true, from = "fullName"), field("phone", "Phone", from = "phone")), userRow, "Save details",
                    onSubmit = { v -> Graph.api.request("PATCH", "/auth/me", v); Graph.auth.me() },
                    onSuccess = { toast(context, "Details saved.") })
            }
        }
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Preferences", style = MaterialTheme.typography.titleMedium)
                Text("Saved to your account and kept after you restart the app.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                when (val st = prefs.state) {
                    is Load.Loading -> LoadingBox()
                    is Load.Err -> ErrorBox(st.message, prefs.reload)
                    is Load.Ok -> InlineForm(
                        listOf(field("theme", "Theme", "select", false, listOf("light", "dark", "system"), "theme"), field("language", "Language", "select", false, listOf("en", "af", "zu"), "language"),
                            field("inAppNotifications", "In-app notifications", "checkbox", false, null, "inAppNotifications"), field("emailNotifications", "Email notifications", "checkbox", false, null, "emailNotifications")),
                        st.value, "Save preferences",
                        onSubmit = { v ->
                            val res = Graph.api.request("PUT", "/settings/me", v)
                            val theme = Logic.text(Logic.get(res, "settings.theme"))
                            if (theme != null) onThemeChange(theme)
                        },
                        onSuccess = { toast(context, "Preferences saved.") }
                    )
                }
            }
        }
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Change password", style = MaterialTheme.typography.titleMedium)
                InlineForm(listOf(field("currentPassword", "Current password", "password", true), FieldDef("newPassword", "New password", "password", true, null, null, null, null, null, "At least 10 characters with upper case, lower case and a number.", null)), null, "Change password",
                    onSubmit = { v -> val res = Graph.api.request("POST", "/auth/change-password", v); Graph.auth.adoptTokens(res) },
                    onSuccess = { toast(context, "Password changed. Other devices were signed out.") })
            }
        }
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Account and help", style = MaterialTheme.typography.titleMedium)
                Text(if (user.role == "client") "Need help? Open Support from the menu and we will respond." else "Need help? Contact your administrator or ops@mhambilogistics.co.za.", style = MaterialTheme.typography.bodySmall)
                Text("Server: ${Graph.settings.baseUrl}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() && user.googleLinked != true) Text("Google sign-in can be linked from the website profile page.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = { confirmAll = true }, modifier = Modifier.fillMaxWidth()) { Text("Sign out of all devices") }
                Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) { Text("Log out") }
            }
        }
    }
    if (confirmAll) ConfirmDialog("Sign out of every device, including this one?", "Sign out everywhere", true, onConfirm = {
        confirmAll = false
        scope.launch { try { Graph.api.request("POST", "/auth/logout-all", JsonObject()) } catch (e: Exception) { toast(context, errorText(e)) }; onLogout() }
    }, onDismiss = { confirmAll = false })
}

@Composable
fun CompanyPage() {
    val context = LocalContext.current
    val holder = loadState("company") { Graph.api.request("GET", "/companies/me").asJsonObject.getAsJsonObject("company") }
    when (val st = holder.state) {
        is Load.Loading -> LoadingBox()
        is Load.Err -> ErrorBox(st.message, holder.reload)
        is Load.Ok -> {
            val c = st.value
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Registered details", style = MaterialTheme.typography.titleMedium)
                        Text("Contact support to change these.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        listOf("Company" to "name", "Client code" to "clientCode", "Registration no." to "registrationNumber", "VAT number" to "vatNumber").forEach { (l, k) ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(l, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(Logic.text(c.get(k)) ?: Logic.EMPTY, fontWeight = FontWeight.SemiBold) }
                        }
                    }
                }
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Contact details", style = MaterialTheme.typography.titleMedium)
                        InlineForm(listOf(field("industry", "Industry", from = "industry"), field("address", "Address", from = "address"), field("city", "City", from = "city"), field("province", "Province", from = "province"),
                            field("postalCode", "Postal code", from = "postalCode"), field("phone", "Phone", from = "phone"), field("email", "Company email", "email", from = "email")), c, "Save changes",
                            onSubmit = { v -> Graph.api.request("PATCH", "/companies/me", v) }, onSuccess = { toast(context, "Company details saved."); holder.reload() })
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsFormPage(page: PageDef) {
    val context = LocalContext.current
    val holder = loadState(page.id) { Graph.api.request("GET", page.endpoint ?: "").asJsonObject.getAsJsonObject("settings") }
    when (val st = holder.state) {
        is Load.Loading -> LoadingBox()
        is Load.Err -> ErrorBox(st.message, holder.reload)
        is Load.Ok -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(page.subtitle ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            InlineForm(page.fields.orEmpty().map { it.copy(from = it.name) }, st.value, "Save settings",
                onSubmit = { v -> Graph.api.request(page.method ?: "PUT", page.endpoint ?: "", v) }, onSuccess = { toast(context, "Settings saved."); holder.reload() })
        }
    }
}
