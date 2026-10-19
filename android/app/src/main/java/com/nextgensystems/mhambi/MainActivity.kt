package com.nextgensystems.mhambi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextgensystems.mhambi.ui.AuthFlow
import com.nextgensystems.mhambi.ui.PortalHost
import com.nextgensystems.mhambi.ui.SplashScreen
import com.nextgensystems.mhambi.ui.theme.MhambiTheme

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val theme by vm.theme.collectAsStateWithLifecycle()
            val state by vm.state.collectAsStateWithLifecycle()
            MhambiTheme(themeSetting = theme) {
                when (val s = state) {
                    is SessionState.Loading -> SplashScreen()
                    is SessionState.SignedOut -> AuthFlow(onSignedIn = vm::onSignedIn)
                    is SessionState.SignedIn -> PortalHost(user = s.user, onLogout = vm::logout, onThemeChange = vm::setTheme)
                }
            }
        }
    }
}
