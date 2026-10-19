package com.nextgensystems.mhambi.data

data class User(
    val id: Long,
    val email: String,
    val fullName: String,
    val phone: String?,
    val role: String,
    val status: String?,
    val companyId: Long?,
    val companyName: String?,
    val driverId: Long?,
    val mustChangePassword: Boolean?,
    val googleLinked: Boolean?,
    val hasPassword: Boolean?
)

data class AuthResponse(val accessToken: String, val refreshToken: String, val user: User)

data class StoredSession(val accessToken: String, val refreshToken: String, val user: User)

data class FieldError(val field: String?, val message: String?)

/** Any failure talking to the backend. status 0 = the server could not be reached. */
class ApiException(
    val status: Int,
    val code: String,
    message: String,
    val details: List<FieldError>? = null
) : Exception(message) {
    /** Message plus per-field problems, ready to show to a person. */
    fun fullMessage(): String {
        val extra = details.orEmpty().mapNotNull { d ->
            val m = d.message ?: return@mapNotNull null
            if (d.field.isNullOrBlank() || d.field == "(root)") m else "${d.field}: $m"
        }
        return if (extra.isEmpty()) (message ?: "Something went wrong.") else (message ?: "") + " " + extra.joinToString(" ")
    }
}
