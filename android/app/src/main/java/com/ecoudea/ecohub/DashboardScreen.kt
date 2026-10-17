package com.ecoudea.ecohub

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape

@Composable
fun DashboardScreen() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = WindowInsets.safeDrawing.asPaddingValues()
    ) {
        item {
            Text(
                text = "Dashboard",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        item {
            DashboardWidget(
                title = "Hábitos",
                content = "• Beber agua\n• Hacer ejercicio\n• Leer 20 páginas"
            )
        }

        item {
            DashboardWidget(
                title = "Notas Rápidas",
                content = "- Comprar leche\n- Llamar al médico a las 4 PM\n- Pagar la factura del internet"
            )
        }

        item {
            DashboardWidget(
                title = "Tareas Pendientes",
                content = "[ ] Terminar el reporte\n[ ] Enviar correo a cliente\n[x] Reunión de equipo"
            )
        }
    }
}

@Composable
fun DashboardWidget(title: String, content: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = content,
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
