package com.nextgensystems.mhambi.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.NoteAdd
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Reply
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Icon
import androidx.core.content.FileProvider
import com.nextgensystems.mhambi.data.ApiException
import com.nextgensystems.mhambi.engine.Logic
import com.nextgensystems.mhambi.ui.theme.ErrorRed
import com.nextgensystems.mhambi.ui.theme.SuccessGreen
import com.nextgensystems.mhambi.ui.theme.WarnAmber
import kotlinx.coroutines.CancellationException
import java.io.File

/** Result of loading something from the API. */
sealed interface Load<out T> {
    object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

class LoadHolder<T>(val state: Load<T>, val reload: () -> Unit)

/** Runs [block] whenever [keys] change (or reload() is called) and exposes Loading / Ok / Err. */
@Composable
fun <T> loadState(vararg keys: Any?, block: suspend () -> T): LoadHolder<T> {
    val tick = remember { mutableStateOf(0) }
    val state: State<Load<T>> = produceLoad(keys, tick.value, block)
    return LoadHolder(state.value) { tick.value = tick.value + 1 }
}

@Composable
private fun <T> produceLoad(keys: Array<out Any?>, tick: Int, block: suspend () -> T): State<Load<T>> {
    val state = remember { mutableStateOf<Load<T>>(Load.Loading) }
    LaunchedEffect(*keys, tick) {
        state.value = Load.Loading
        state.value = try {
            Load.Ok(block())
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            Load.Err(e.fullMessage())
        } catch (e: Exception) {
            Load.Err(e.message ?: "Something went wrong.")
        }
    }
    return state
}

fun toast(context: Context, message: String) = Toast.makeText(context, message, Toast.LENGTH_LONG).show()

fun errorText(e: Throwable): String = if (e is ApiException) e.fullMessage() else (e.message ?: "Something went wrong.")

/** Shares a downloaded file with other apps (open, save, send). */
fun shareFile(context: Context, file: File) {
    val ext = file.extension.lowercase()
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
    val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, file.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        toast(context, "No app is available to open this link.")
    }
}

/** Maps the website's Font Awesome icon names (kept in portal-config.json) to Material icons. */
fun iconFor(name: String?): ImageVector = when (name) {
    "pen" -> Icons.Filled.Edit
    "user-shield" -> Icons.Filled.AdminPanelSettings
    "user-slash", "ban" -> Icons.Filled.Block
    "link-slash" -> Icons.Filled.LinkOff
    "box-archive" -> Icons.Filled.Inventory2
    "user-check", "check" -> Icons.Filled.Check
    "xmark" -> Icons.Filled.Close
    "list" -> Icons.Filled.List
    "eye" -> Icons.Filled.Visibility
    "magnifying-glass" -> Icons.Filled.Search
    "file-invoice-dollar", "receipt" -> Icons.Filled.Receipt
    "truck-ramp-box", "truck", "truck-fast" -> Icons.Filled.LocalShipping
    "user-plus" -> Icons.Filled.PersonAdd
    "route", "map-location-dot", "location-dot" -> Icons.Filled.Place
    "location-arrow" -> Icons.Filled.Navigation
    "rotate-left" -> Icons.Filled.Replay
    "download", "arrow-down-to-line" -> Icons.Filled.Download
    "trash" -> Icons.Filled.Delete
    "arrow-up-from-line" -> Icons.Filled.Upload
    "right-left" -> Icons.Filled.SwapHoriz
    "scale-balanced" -> Icons.Filled.Tune
    "boxes-packing", "box" -> Icons.Filled.Inventory2
    "cart-plus" -> Icons.Filled.AddShoppingCart
    "play" -> Icons.Filled.PlayArrow
    "paper-plane" -> Icons.Filled.Send
    "file-circle-plus" -> Icons.Filled.NoteAdd
    "money-bill-wave" -> Icons.Filled.Payments
    "signature" -> Icons.Filled.Draw
    "triangle-exclamation", "circle-exclamation" -> Icons.Filled.Warning
    "warehouse" -> Icons.Filled.Warehouse
    "reply" -> Icons.Filled.Reply
    else -> Icons.Filled.ChevronRight
}

@Composable
fun StatusBadge(value: String?) {
    val group = Logic.statusGroup(value)
    val color = when (group) { "good" -> SuccessGreen; "bad" -> ErrorRed; else -> WarnAmber }
    Box(
        Modifier
            .background(color.copy(alpha = 0.14f), RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(Logic.label(value).ifBlank { Logic.EMPTY }, color = color, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)?) {
    Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(36.dp))
        Text(message, color = ErrorRed, style = MaterialTheme.typography.bodyMedium)
        if (onRetry != null) Button(onClick = onRetry) { Icon(Icons.Filled.Refresh, contentDescription = null); Spacer(Modifier.size(8.dp)); Text("Try again") }
    }
}

@Composable
fun EmptyBox(title: String, hint: String = "") {
    Column(Modifier.fillMaxWidth().padding(36.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Filled.Inventory2, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(40.dp))
        Text(title, fontWeight = FontWeight.SemiBold)
        if (hint.isNotBlank()) Text(hint, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun ErrorBanner(message: String?) {
    if (message.isNullOrBlank()) return
    Box(
        Modifier.fillMaxWidth().background(ErrorRed.copy(alpha = 0.12f), RoundedCornerShape(10.dp)).padding(12.dp)
    ) { Text(message, color = ErrorRed, style = MaterialTheme.typography.bodyMedium) }
}

@Composable
fun ConfirmDialog(message: String, confirmLabel: String, danger: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Please confirm") },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirmLabel, color = if (danger) ErrorRed else MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
}

@Composable
fun FullScreenCenter(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

@Composable
fun Spacer8() { Spacer(Modifier.height(8.dp)) }

val NavyBackdrop = Color(0xFF082F49)
