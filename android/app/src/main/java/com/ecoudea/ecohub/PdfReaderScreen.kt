package com.ecoudea.ecohub

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfReaderScreen() {
    var selectedPdfUri by remember { mutableStateOf<Uri?>(null) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        selectedPdfUri = uri
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Lector PDF") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Button(onClick = { launcher.launch("application/pdf") }) {
                Text("Seleccionar PDF")
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (selectedPdfUri != null) {
                Text(
                    text = "PDF Seleccionado:\n$selectedPdfUri",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(16.dp)
                )
                Text(
                    text = "Nota: La visualización completa del PDF con zoom y scroll requiere integración avanzada. Por ahora se confirma la selección.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary
                )
            } else {
                Text(
                    text = "No se ha seleccionado ningún PDF.",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}
