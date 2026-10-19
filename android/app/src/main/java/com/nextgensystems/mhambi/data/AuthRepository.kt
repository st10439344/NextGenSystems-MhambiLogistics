package com.nextgensystems.mhambi.data

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject

/** Sign-in, registration and session operations. Roles always come from the server response. */
class AuthRepository(private val api: ApiClient, private val session: SessionStore) {
    private val gson = Gson()

    private fun body(vararg pairs: Pair<String, String?>): JsonObject =
        JsonObject().apply { pairs.forEach { (k, v) -> if (v != null) addProperty(k, v) } }

    private fun store(json: JsonElement): User {
        val auth = gson.fromJson(json, AuthResponse::class.java)
        session.save(StoredSession(auth.accessToken, auth.refreshToken, auth.user))
        return auth.user
    }

    suspend fun login(email: String, password: String): User =
        store(api.request("POST", "/auth/login", body("email" to email, "password" to password), auth = false))

    suspend fun register(
        fullName: String, email: String, phone: String, companyName: String, password: String, confirmPassword: String
    ): User = store(
        api.request("POST", "/auth/register", body(
            "fullName" to fullName, "email" to email, "phone" to phone, "companyName" to companyName,
            "password" to password, "confirmPassword" to confirmPassword
        ), auth = false)
    )

    suspend fun googleLogin(idToken: String): User =
        store(api.request("POST", "/auth/google", body("idToken" to idToken), auth = false))

    suspend fun googleRegister(idToken: String, companyName: String, phone: String): User =
        store(api.request("POST", "/auth/google/register", body("idToken" to idToken, "companyName" to companyName, "phone" to phone), auth = false))

    suspend fun forgotPassword(email: String): String {
        val r = api.request("POST", "/auth/forgot-password", body("email" to email), auth = false)
        return r.asJsonObject.get("message")?.asString ?: "If an account exists for that email, a reset link has been sent."
    }

    suspend fun me(): User {
        val r = api.request("GET", "/auth/me")
        val user = gson.fromJson(r.asJsonObject.get("user"), User::class.java)
        session.load()?.let { session.save(it.copy(user = user)) }
        return user
    }

    /** Replaces the stored tokens after a password change (the server revokes all other sessions). */
    fun adoptTokens(json: JsonElement) { store(json) }

    suspend fun logout() {
        val s = session.load()
        session.clear()
        if (s != null) {
            try {
                api.request("POST", "/auth/logout", body("refreshToken" to s.refreshToken), auth = false)
            } catch (e: ApiException) {
                // already signed out locally; the refresh token will simply expire
            }
        }
    }
}
