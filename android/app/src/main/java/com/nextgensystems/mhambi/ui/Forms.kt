package com.nextgensystems.mhambi.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.nextgensystems.mhambi.Graph
import com.nextgensystems.mhambi.engine.ActionDef
import com.nextgensystems.mhambi.engine.Choice
import com.nextgensystems.mhambi.engine.FieldDef
import com.nextgensystems.mhambi.engine.Logic
import com.nextgensystems.mhambi.engine.staticChoices
import kotlinx.coroutines.launch
import java.util.Calendar

/** Loads dropdown options for fields whose list comes from the API (drivers, vehicles, companies, ...). */
private suspend fun loadChoices(f: FieldDef): List<Choice> {
    val from = f.optionsFrom ?: return f.staticChoices()
    val json = Graph.api.request("GET", from.url)
    val arr = Logic.get(json, from.path ?: "data")
    if (arr == null || !arr.isJsonArray) return emptyList()
    return arr.asJsonArray.mapNotNull { el ->
        val o = el.asJsonObject
        val value = Logic.text(o.get(from.value)) ?: return@mapNotNull null
        val label = if (from.tpl != null) Logic.tpl(from.tpl, o) else (Logic.text(o.get(from.label)) ?: value)
        Choice(value, label)
    }
}

/** Builds the request body from what was typed. Returns an error message if something required is missing or invalid. */
fun buildBody(fields: List<FieldDef>, values: Map<String, String>): Pair<JsonObject?, String?> {
    val body = JsonObject()
    for (f in fields) {
        val raw = (values[f.name] ?: "").trim()
        if (f.type == "checkbox") { body.addProperty(f.name, raw == "true"); continue }
        if (raw.isEmpty()) {
            if (f.required == true) return Pair(null, "${f.label} is required.")
            continue
        }
        when {
            f.type == "number" || (f.type == "select" && f.cast == "number") -> {
                val n = Logic.numberValue(raw) ?: return Pair(null, "${f.label} must be a number.")
                body.addProperty(f.name, n)
            }
            f.type == "datetime" -> {
                val iso = Logic.localToIso(raw) ?: return Pair(null, "${f.label} is not a valid date and time.")
                body.addProperty(f.name, iso)
            }
            else -> body.addProperty(f.name, raw)
        }
    }
    return Pair(body, null)
}

/**
 * A form built from field definitions (same definitions the website uses).
 * Validates required fields, shows server-side validation errors, and prevents double submission.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InlineForm(
    fields: List<FieldDef>,
    row: JsonObject?,
    submitLabel: String,
    onSubmit: suspend (JsonObject) -> Unit,
    onSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    extraButton: (@Composable () -> Unit)? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val values = remember(fields, row) {
        mutableStateMapOf<String, String>().also { m ->
            fields.forEach { f ->
                val initial = f.from?.let { Logic.text(Logic.get(row, it)) }
                m[f.name] = when {
                    f.type == "date" && initial != null -> initial.take(10)
                    initial != null -> initial
                    f.type == "checkbox" -> "false"
                    f.type == "select" && f.optionsFrom == null && f.optional != true && f.required != true -> f.staticChoices().firstOrNull()?.value ?: ""
                    else -> ""
                }
            }
        }
    }
    val choices = remember(fields) { mutableStateMapOf<String, List<Choice>>() }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(fields) {
        fields.filter { it.type == "select" }.forEach { f ->
            try { choices[f.name] = loadChoices(f) } catch (e: Exception) { choices[f.name] = emptyList(); error = "Could not load ${f.label}: ${errorText(e)}" }
        }
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ErrorBanner(error)
        fields.forEach { f ->
            val v = values[f.name] ?: ""
            when (f.type) {
                "select" -> {
                    val list = choices[f.name] ?: emptyList()
                    var open by remember { mutableStateOf(false) }
                    val shown = list.firstOrNull { it.value == v }?.label ?: ""
                    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = !open }) {
                        OutlinedTextField(
                            value = shown, onValueChange = {}, readOnly = true,
                            label = { Text(f.label + if (f.required == true) " *" else "") },
                            placeholder = { Text(if (choices.containsKey(f.name)) (if (list.isEmpty()) "Nothing available" else "Select\u2026") else "Loading\u2026") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
                            modifier = Modifier.menuAnchor().fillMaxWidth()
                        )
                        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                            if (f.optional == true || f.required != true && f.optionsFrom != null) {
                                DropdownMenuItem(text = { Text("\u2014 none \u2014") }, onClick = { values[f.name] = ""; open = false })
                            }
                            list.forEach { c -> DropdownMenuItem(text = { Text(c.label) }, onClick = { values[f.name] = c.value; open = false }) }
                        }
                    }
                }
                "checkbox" -> Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Checkbox(checked = v == "true", onCheckedChange = { values[f.name] = if (it) "true" else "false" })
                    Text(f.label)
                }
                "date", "datetime" -> {
                    Text(f.label + if (f.required == true) " *" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        OutlinedButton(onClick = {
                            val cal = Calendar.getInstance()
                            DatePickerDialog(context, { _, y, m, d ->
                                val day = "%04d-%02d-%02d".format(y, m + 1, d)
                                if (f.type == "date") values[f.name] = day
                                else TimePickerDialog(context, { _, h, min -> values[f.name] = "${day}T%02d:%02d".format(h, min) }, 8, 0, true).show()
                            }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
                        }) { Text(if (v.isBlank()) (if (f.type == "date") "Choose date" else "Choose date and time") else v.replace("T", " ")) }
                        if (v.isNotBlank() && f.required != true) TextButton(onClick = { values[f.name] = "" }) { Text("Clear") }
                    }
                }
                else -> {
                    var show by remember { mutableStateOf(false) }
                    val isPassword = f.type == "password"
                    val support: (@Composable () -> Unit)? = if (f.hint != null) ({ Text(f.hint) }) else null
                    val trailing: (@Composable () -> Unit)? = if (isPassword) ({
                        IconButton(onClick = { show = !show }) {
                            Icon(if (show) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "Show or hide password")
                        }
                    }) else null
                    OutlinedTextField(
                        value = v,
                        onValueChange = { values[f.name] = it },
                        label = { Text(f.label + if (f.required == true) " *" else "") },
                        supportingText = support,
                        singleLine = f.type != "textarea",
                        minLines = if (f.type == "textarea") 3 else 1,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = when (f.type) { "email" -> KeyboardType.Email; "number" -> KeyboardType.Decimal; "password" -> KeyboardType.Password; else -> KeyboardType.Text }
                        ),
                        visualTransformation = if (isPassword && !show) PasswordVisualTransformation() else VisualTransformation.None,
                        trailingIcon = trailing,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Button(
                enabled = !busy,
                onClick = {
                    error = null
                    val (body, problem) = buildBody(fields, values)
                    if (body == null) { error = problem; return@Button }
                    busy = true
                    scope.launch {
                        try { onSubmit(body); busy = false; onSuccess() }
                        catch (e: Exception) { busy = false; error = errorText(e) }
                    }
                }
            ) {
                if (busy) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.size(8.dp)) }
                Text(if (busy) "Saving\u2026" else submitLabel)
            }
            extraButton?.invoke()
        }
    }
}

/** InlineForm inside a dialog. */
@Composable
fun FormDialog(
    title: String,
    fields: List<FieldDef>,
    row: JsonObject?,
    submitLabel: String,
    onSubmit: suspend (JsonObject) -> Unit,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                InlineForm(
                    fields = fields, row = row, submitLabel = submitLabel, onSubmit = onSubmit,
                    onSuccess = onSuccess, modifier = Modifier.padding(top = 4.dp),
                    extraButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
                )
            }
        },
        confirmButton = {}
    )
}

/** Read-only details (and history timeline / sub-tables) for an action of type "detail". */
@Composable
fun DetailDialog(action: ActionDef, row: JsonObject, onDismiss: () -> Unit) {
    val detail = action.detail ?: return
    val holder = loadState(action.label, row.toString()) {
        if (detail.url != null) Graph.api.request("GET", Logic.tpl(detail.url, row)) else row as JsonElement
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(Logic.tpl(detail.title, row)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                when (val st = holder.state) {
                    is Load.Loading -> LoadingBox()
                    is Load.Err -> ErrorBox(st.message, holder.reload)
                    is Load.Ok -> {
                        val data = st.value
                        detail.fields.orEmpty().forEach { f ->
                            val el = Logic.get(data, f.path)
                            val shown = if (el == null) Logic.EMPTY else Logic.cell(f.type, el, JsonObject(), f.path)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(f.label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(0.4f))
                                Text(shown, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(0.6f))
                            }
                        }
                        detail.lists.orEmpty().forEach { l ->
                            SectionTitle(l.title)
                            val items = Logic.get(data, l.path)
                            if (items == null || !items.isJsonArray || items.asJsonArray.size() == 0) {
                                Text("Nothing to show.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else if (l.path == "history") {
                                items.asJsonArray.forEach { h ->
                                    val o = h.asJsonObject
                                    Column(Modifier.padding(vertical = 4.dp)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                            StatusBadge(Logic.text(o.get("status")))
                                            Text(Logic.datetime(Logic.text(o.get("at"))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Logic.text(o.get("note"))?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                                        Logic.text(o.get("location"))?.let { Text("\u2022 $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    }
                                }
                            } else if (l.scalar == true) {
                                Text(items.asJsonArray.joinToString(", ") { Logic.text(it) ?: "" }, style = MaterialTheme.typography.bodySmall)
                            } else {
                                items.asJsonArray.forEach { it0 ->
                                    val o = it0.asJsonObject
                                    Text(l.columns.orEmpty().joinToString("  \u00B7  ") { c -> Logic.cell(c.type, Logic.get(o, c.field), o, c.field) }, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}
