package com.nextgensystems.mhambi.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape

// Mhambi Logistics brand (same values as the website's css/style.css)
val Navy = Color(0xFF0A3D62)
val Orange = Color(0xFFF7941D)
val DarkNavy = Color(0xFF082F49)
val LightBg = Color(0xFFF3F6FA)
val InkText = Color(0xFF14243A)
val MutedText = Color(0xFF718096)
val SuccessGreen = Color(0xFF187A59)
val ErrorRed = Color(0xFFC0392B)
val WarnAmber = Color(0xFFB36500)

private val LightColors = lightColorScheme(
    primary = Navy, onPrimary = Color.White,
    secondary = Orange, onSecondary = DarkNavy,
    tertiary = SuccessGreen,
    background = LightBg, onBackground = InkText,
    surface = Color.White, onSurface = InkText,
    surfaceVariant = Color(0xFFE8EEF5), onSurfaceVariant = MutedText,
    error = ErrorRed, outline = Color(0xFFCBD5E0)
)

private val DarkColors = darkColorScheme(
    primary = Orange, onPrimary = DarkNavy,
    secondary = Orange, onSecondary = DarkNavy,
    tertiary = Color(0xFF4CC9A0),
    background = Color(0xFF0B1823), onBackground = Color(0xFFE3EBF3),
    surface = Color(0xFF12283A), onSurface = Color(0xFFE3EBF3),
    surfaceVariant = Color(0xFF1B3750), onSurfaceVariant = Color(0xFF9DB0C2),
    error = Color(0xFFFF8A80), outline = Color(0xFF2C4660)
)

private val AppTypography = Typography(
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 26.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(8.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(20.dp)
)

/** @param themeSetting "light", "dark" or "system" (saved in Settings and on the account). */
@Composable
fun MhambiTheme(themeSetting: String, content: @Composable () -> Unit) {
    val dark = when (themeSetting) {
        "dark" -> true
        "system" -> isSystemInDarkTheme()
        else -> false
    }
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, typography = AppTypography, shapes = AppShapes, content = content)
}
