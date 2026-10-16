package com.ecoudea.ecohub

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Link

data class AcademicDate(val title: String, val date: String)
data class AcademicLink(val title: String, val url: String)

@Composable
fun AcademicScreen() {
    val importantDates = listOf(
        AcademicDate("Inicio de clases", "15 de Febrero"),
        AcademicDate("Parciales (Semana 1)", "20-25 de Marzo"),
        AcademicDate("Cancelación de cursos", "10 de Abril"),
        AcademicDate("Exámenes finales", "1-10 de Junio")
    )

    val portalLinks = listOf(
        AcademicLink("Portal Universitario", "https://www.udea.edu.co"),
        AcademicLink("SSO (Mares)", "https://sso.udea.edu.co"),
        AcademicLink("Biblioteca", "https://biblioteca.udea.edu.co"),
        AcademicLink("Bienestar Universitario", "https://bienestar.udea.edu.co")
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = WindowInsets.safeDrawing.asPaddingValues()
    ) {
        item {
            Text(
                text = "Académico",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        item {
            SectionTitle(title = "Fechas Importantes", icon = Icons.Default.DateRange)
        }

        items(importantDates) { date ->
            AcademicDateItem(date)
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            SectionTitle(title = "Enlaces a Portales", icon = Icons.Default.Link)
        }

        items(portalLinks) { link ->
            AcademicLinkItem(link)
        }
    }
}

@Composable
fun SectionTitle(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = title,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}

@Composable
fun AcademicDateItem(date: AcademicDate) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            Text(
                text = date.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = date.date,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
fun AcademicLinkItem(link: AcademicLink) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        onClick = {
            // Future enhancement: Open link in Custom Tabs or Browser
        }
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = link.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = link.url,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
        }
    }
}
