package com.nextgensystems.mhambi.ui

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.nextgensystems.mhambi.BuildConfig
import com.nextgensystems.mhambi.Graph
import com.nextgensystems.mhambi.R
import com.nextgensystems.mhambi.data.ApiException
import com.nextgensystems.mhambi.data.User
import com.nextgensystems.mhambi.ui.theme.DarkNavy
import com.nextgensystems.mhambi.ui.theme.Navy
import com.nextgensystems.mhambi.ui.theme.Orange
import kotlinx.coroutines.launch

private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")
private val PHONE = Regex("^\\+?[0-9 ()-]{7,20}$")

@Composable
fun SplashScreen() {
    Box(Modifier.fillMaxSize().background(DarkNavy), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(32.dp)) {
            Image(painterResource(R.drawable.logo), contentDescription = "Mhambi Logistics", modifier = Modifier.widthIn(max = 220.dp), contentScale = ContentScale.Fit)
            Text("Mhambi Logistics", color = Color.White, style = MaterialTheme.typography.headlineMedium)
            Box(Modifier.size(width = 64.dp, height = 4.dp).background(Orange, RoundedCornerShape(2.dp)))
            Text("Connecting Africa, Delivering Excellence", color = Color(0xFFCBD5E0), textAlign = TextAlign.Center)
            Spacer(Modifier.height(18.dp))
            CircularProgressIndicator(color = Orange)
        }
    }
}

private enum class AuthScreen { Login, Register, Forgot }

@Composable
fun AuthFlow(onSignedIn: (User) -> Unit) {
    var screen by rememberSaveable { mutableStateOf(AuthScreen.Login) }
    when (screen) {
        AuthScreen.Login -> LoginScreen(onSignedIn, onRegister = { screen = AuthScreen.Register }, onForgot = { screen = AuthScreen.Forgot })
        AuthScreen.Register -> RegisterScreen(onSignedIn, onBack = { screen = AuthScreen.Login })
        AuthScreen.Forgot -> ForgotScreen(onBack = { screen = AuthScreen.Login })
    }
}

@Composable
private fun AuthScaffold(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(DarkNavy).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(36.dp))
        Image(painterResource(R.drawable.logo), contentDescription = "Mhambi Logistics", modifier = Modifier.widthIn(max = 170.dp), contentScale = ContentScale.Fit)
        Spacer(Modifier.height(14.dp))
        Text(title, color = Color.White, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, color = Color(0xFFCBD5E0), textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 32.dp, vertical = 4.dp))
        Spacer(Modifier.height(20.dp))
        Card(
            modifier = Modifier.padding(horizontal = 16.dp).widthIn(max = 480.dp).fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() } }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun PasswordField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true,
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { show = !show }) {
                Icon(if (show) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = if (show) "Hide password" else "Show password")
            }
        },
        modifier = modifier.fillMaxWidth()
    )
}

/** Asks Google for an ID token (the server verifies it and decides the role). Returns null if cancelled. */
private suspend fun requestGoogleIdToken(context: Context): String? {
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val result = CredentialManager.create(context).getCredential(context, request)
    val cred = result.credential
    return if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        GoogleIdTokenCredential.createFrom(cred.data).idToken
    } else null
}

@Composable
fun LoginScreen(onSignedIn: (User) -> Unit, onRegister: () -> Unit, onForgot: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showServer by remember { mutableStateOf(false) }
    var googleToken by remember { mutableStateOf<String?>(null) }   // set when Google works but no account exists yet

    fun signIn() {
        error = null
        val e = email.trim()
        when {
            e.isEmpty() -> { error = "Enter your email address."; return }
            !EMAIL.matches(e) -> { error = "Enter a valid email address."; return }
            password.isEmpty() -> { error = "Enter your password."; return }
        }
        busy = true
        scope.launch {
            try { onSignedIn(Graph.auth.login(e, password)) }
            catch (ex: Exception) { busy = false; error = errorText(ex) }
        }
    }

    fun googleSignIn() {
        error = null; busy = true
        scope.launch {
            try {
                val token = requestGoogleIdToken(context)
                if (token == null) { busy = false; error = "Google sign-in did not return a valid account." }
                else {
                    try { onSignedIn(Graph.auth.googleLogin(token)) }
                    catch (ex: ApiException) {
                        busy = false
                        if (ex.code == "GOOGLE_NOT_REGISTERED") googleToken = token else error = ex.fullMessage()
                    }
                }
            } catch (c: GetCredentialCancellationException) { busy = false }
            catch (g: GetCredentialException) { busy = false; error = "Google sign-in failed: ${g.message ?: "please try again."}" }
            catch (ex: Exception) { busy = false; error = errorText(ex) }
        }
    }

    AuthScaffold("Welcome back", "Sign in to your Mhambi Logistics account. Your dashboard is chosen automatically from your assigned role.") {
        ErrorBanner(error)
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text("Email address") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth()
        )
        PasswordField(password, { password = it }, "Password")
        Button(onClick = { signIn() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = Navy)) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White) else Text("Sign in")
        }
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            OutlinedButton(onClick = { googleSignIn() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { Text("Continue with Google") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onForgot) { Text("Forgot password?") }
            TextButton(onClick = onRegister) { Text("Create client account", fontWeight = FontWeight.Bold) }
        }
        TextButton(onClick = { showServer = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Server settings", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }

    if (showServer) ServerSettingsDialog(onDismiss = { showServer = false })
    googleToken?.let { token ->
        GoogleRegisterDialog(token, onDismiss = { googleToken = null }, onSignedIn = onSignedIn)
    }
}

@Composable
private fun GoogleRegisterDialog(idToken: String, onDismiss: () -> Unit, onSignedIn: (User) -> Unit) {
    val scope = rememberCoroutineScope()
    var company by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Finish creating your account") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("No Mhambi account is linked to this Google account yet. Add your company details to create a Client account.")
                ErrorBanner(error)
                OutlinedTextField(company, { company = it }, label = { Text("Company name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(phone, { phone = it }, label = { Text("Phone number") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(enabled = !busy, onClick = {
                if (company.isBlank()) { error = "Company name is required."; return@Button }
                if (!PHONE.matches(phone.trim())) { error = "Enter a valid phone number."; return@Button }
                busy = true; error = null
                scope.launch {
                    try { onSignedIn(Graph.auth.googleRegister(idToken, company.trim(), phone.trim())) }
                    catch (ex: Exception) { busy = false; error = errorText(ex) }
                }
            }) { Text(if (busy) "Creating\u2026" else "Create account") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun ServerSettingsDialog(onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf(Graph.settings.baseUrl) }
    var message by remember { mutableStateOf<String?>(null) }
    var ok by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Server settings") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Address of the Mhambi Logistics backend, for example https://your-service.onrender.com or http://192.168.1.20:3000 (your PC's LAN address). Do not use \"localhost\": inside BlueStacks or a phone that means the device itself.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(url, { url = it }, label = { Text("Server address") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                message?.let { m -> Text(m, color = if (ok) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            Button(enabled = !busy, onClick = {
                busy = true; message = null
                scope.launch {
                    val saved = Graph.settings.setBaseUrl(url)
                    if (!saved) { ok = false; message = "Enter a full address starting with http:// or https://"; busy = false; return@launch }
                    url = Graph.settings.baseUrl
                    try {
                        val r = Graph.api.request("GET", "/health", auth = false)
                        val db = r.asJsonObject.get("database")?.asString
                        ok = true; message = "Connected. Server is up (database: $db)."
                    } catch (e: Exception) { ok = false; message = "Saved, but the server did not answer: ${errorText(e)}" }
                    busy = false
                }
            }) { Text(if (busy) "Testing\u2026" else "Save and test") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
fun RegisterScreen(onSignedIn: (User) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var company by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val problems = mutableListOf<String>()
        if (fullName.isBlank()) problems.add("Full name is required.")
        if (!EMAIL.matches(email.trim())) problems.add("Enter a valid email address.")
        if (!PHONE.matches(phone.trim())) problems.add("Enter a valid phone number.")
        if (company.isBlank()) problems.add("Company name is required.")
        if (password.length < 10 || !password.any { it.isLowerCase() } || !password.any { it.isUpperCase() } || !password.any { it.isDigit() })
            problems.add("Password must be at least 10 characters with upper case, lower case and a number.")
        if (password != confirm) problems.add("Passwords do not match.")
        if (problems.isNotEmpty()) { error = problems.joinToString(" "); return }
        error = null; busy = true
        scope.launch {
            try { onSignedIn(Graph.auth.register(fullName.trim(), email.trim(), phone.trim(), company.trim(), password, confirm)) }
            catch (ex: ApiException) { busy = false; error = if (ex.code == "EMAIL_EXISTS") "An account with this email already exists. Try signing in instead." else ex.fullMessage() }
            catch (ex: Exception) { busy = false; error = errorText(ex) }
        }
    }

    AuthScaffold("Create your account", "Register your company to request quotations, track shipments and view invoices. Public registration creates Client accounts only.") {
        ErrorBanner(error)
        OutlinedTextField(fullName, { fullName = it }, label = { Text("Full name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email address") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(phone, { phone = it }, label = { Text("Phone number") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(company, { company = it }, label = { Text("Company name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        PasswordField(password, { password = it }, "Password")
        PasswordField(confirm, { confirm = it }, "Confirm password")
        Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = Navy)) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White) else Text("Register")
        }
        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("I already have an account") }
    }
}

@Composable
fun ForgotScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf<String?>(null) }
    AuthScaffold("Forgot password", "Enter your account email. If it exists, we will email you a link to choose a new password.") {
        ErrorBanner(error)
        done?.let { Text(it, color = MaterialTheme.colorScheme.tertiary) }
        OutlinedTextField(email, { email = it }, label = { Text("Email address") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        Button(
            enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = Navy),
            onClick = {
                error = null; done = null
                if (!EMAIL.matches(email.trim())) { error = "Enter a valid email address."; return@Button }
                busy = true
                scope.launch {
                    try { done = Graph.auth.forgotPassword(email.trim()) } catch (ex: Exception) { error = errorText(ex) }
                    busy = false
                }
            }
        ) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White) else Text("Send reset link") }
        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Back to sign in") }
    }
}
