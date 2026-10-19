package com.nextgensystems.mhambi

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nextgensystems.mhambi.data.ApiException
import com.nextgensystems.mhambi.data.User
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface SessionState {
    object Loading : SessionState
    object SignedOut : SessionState
    data class SignedIn(val user: User) : SessionState
}

class AppViewModel : ViewModel() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state

    /** "light" | "dark" | "system", persisted on the device and synced with the account. */
    val theme: StateFlow<String> = Graph.settings.themeFlow.stateIn(viewModelScope, SharingStarted.Eagerly, "light")

    init {
        bootstrap()
        viewModelScope.launch { Graph.api.sessionExpired.collect { _state.value = SessionState.SignedOut } }
    }

    /** Splash logic: use the stored session if any, confirm it (and the role) with the server, otherwise go to sign-in. */
    private fun bootstrap() {
        viewModelScope.launch {
            val minimumSplash = launch { delay(800) }
            val stored = Graph.session.load()
            val next: SessionState = if (stored == null) {
                SessionState.SignedOut
            } else {
                try {
                    SessionState.SignedIn(Graph.auth.me())
                } catch (e: ApiException) {
                    if (e.status == 0) SessionState.SignedIn(stored.user) // offline: keep the cached user, API calls will report the problem
                    else { Graph.session.clear(); SessionState.SignedOut }
                }
            }
            minimumSplash.join()
            _state.value = next
            if (next is SessionState.SignedIn) syncThemeFromAccount()
        }
    }

    fun onSignedIn(user: User) {
        _state.value = SessionState.SignedIn(user)
        syncThemeFromAccount()
    }

    fun logout() {
        viewModelScope.launch {
            Graph.auth.logout()
            _state.value = SessionState.SignedOut
        }
    }

    fun setTheme(theme: String) {
        viewModelScope.launch { Graph.settings.setTheme(theme) }
    }

    private fun syncThemeFromAccount() {
        viewModelScope.launch {
            try {
                val r = Graph.api.request("GET", "/settings/me")
                val t = r.asJsonObject.getAsJsonObject("settings")?.get("theme")?.asString
                if (t != null) Graph.settings.setTheme(t)
            } catch (e: Exception) {
                // non-critical: keep the locally saved theme
            }
        }
    }
}
