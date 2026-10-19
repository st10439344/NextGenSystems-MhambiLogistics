package com.nextgensystems.mhambi.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nextgensystems.mhambi.Graph
import com.nextgensystems.mhambi.R
import com.nextgensystems.mhambi.data.User
import com.nextgensystems.mhambi.ui.theme.DarkNavy
import com.nextgensystems.mhambi.ui.theme.Navy
import com.nextgensystems.mhambi.ui.theme.Orange
import kotlinx.coroutines.launch

/**
 * The single signed-in shell for all eight roles. Which pages exist comes from the role the SERVER returned,
 * and every page is built from portal-config.json (shared with the website).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalHost(user: User, onLogout: () -> Unit, onThemeChange: (String) -> Unit) {
    val config = Graph.config
    val role = config.role(user.role)
    if (role == null) {
        FullScreenCenter { ErrorBox("This app does not know the role \"${user.role}\". Please contact an administrator.", onLogout) }
        return
    }
    val scope = rememberCoroutineScope()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    var pageId by rememberSaveable(user.id) { mutableStateOf(role.home) }
    var unread by remember { mutableStateOf(0) }
    var refreshTick by remember { mutableStateOf(0) }

    LaunchedEffect(pageId, refreshTick) {
        try {
            val r = Graph.api.request("GET", "/notifications/unread-count")
            unread = r.asJsonObject.get("unreadCount")?.asInt ?: 0
        } catch (e: Exception) { /* non-critical */ }
    }

    val page = config.page(pageId)

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.fillMaxWidth().background(DarkNavy).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Image(painterResource(R.drawable.logo), contentDescription = "Mhambi Logistics", modifier = Modifier.widthIn(max = 130.dp), contentScale = ContentScale.Fit)
                    Text(user.fullName, color = Color.White, fontWeight = FontWeight.Bold)
                    Text(role.title, color = Orange, style = MaterialTheme.typography.bodySmall)
                    Text(user.email, color = Color(0xFFCBD5E0), style = MaterialTheme.typography.bodySmall)
                }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 8.dp)) {
                    role.nav.forEach { id ->
                        val p = config.page(id) ?: return@forEach
                        NavigationDrawerItem(
                            label = { Text(p.title.replace(" Dashboard", "")) },
                            selected = id == pageId,
                            onClick = { pageId = id; scope.launch { drawer.close() } },
                            colors = NavigationDrawerItemDefaults.colors(selectedContainerColor = Orange.copy(alpha = 0.22f)),
                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                        )
                    }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    NavigationDrawerItem(
                        label = { Text("Log out") },
                        icon = { Icon(Icons.Filled.PowerSettingsNew, contentDescription = null) },
                        selected = false,
                        onClick = { scope.launch { drawer.close() }; onLogout() },
                        modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                    )
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(page?.title ?: "Mhambi Logistics", maxLines = 1, color = Color.White, fontWeight = FontWeight.Bold) },
                    navigationIcon = { IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Filled.Menu, contentDescription = "Open menu", tint = Color.White) } },
                    actions = {
                        IconButton(onClick = { pageId = "notifications"; refreshTick++ }) {
                            BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                                Icon(Icons.Filled.Notifications, contentDescription = "Notifications", tint = Color.White)
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy)
                )
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
                if (page == null) {
                    ErrorBox("This page is not configured.", null)
                } else {
                    // key() makes every page start fresh (its own loading state) when you switch
                    androidx.compose.runtime.key(page.id) {
                        PageContent(
                            page = page, user = user, role = user.role, onLogout = onLogout, onThemeChange = onThemeChange,
                            onNavigate = { pageId = it },
                            onUnreadChanged = { unread = it }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PageContent(
    page: com.nextgensystems.mhambi.engine.PageDef,
    user: User,
    role: String,
    onLogout: () -> Unit,
    onThemeChange: (String) -> Unit,
    onNavigate: (String) -> Unit,
    onUnreadChanged: (Int) -> Unit
) {
    when (page.type) {
        "dashboard" -> DashboardPage(role, onNavigate)
        "table" -> TablePage(page)
        "tracking" -> TrackingPage(page)
        "reports" -> ReportsPage(page)
        "notifications" -> NotificationsPage(role, onUnreadChanged)
        "profile" -> ProfilePage(user, onLogout, onThemeChange)
        "company" -> CompanyPage()
        "settings-form" -> SettingsFormPage(page)
        else -> ErrorBox("Unsupported screen type: ${page.type}", null)
    }
}
