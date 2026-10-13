package com.ecoudea.ecohub.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun CalculatorScreen(viewModel: CalculatorViewModel = viewModel()) {
    val display by viewModel.display.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .imePadding(),
        verticalArrangement = Arrangement.Bottom
    ) {
        // Display
        Text(
            text = display,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 32.dp),
            textAlign = TextAlign.End,
            fontSize = 64.sp,
            fontWeight = FontWeight.Light,
            maxLines = 1,
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Keypad
        val buttons = listOf(
            listOf("C", "⌫", "/", "*"),
            listOf("7", "8", "9", "-"),
            listOf("4", "5", "6", "+"),
            listOf("1", "2", "3", "="),
            listOf("0", ".")
        )

        buttons.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.forEach { symbol ->
                    val weight = if (symbol == "0") 2f else 1f

                    CalculatorButton(
                        symbol = symbol,
                        modifier = Modifier
                            .weight(weight)
                            .height(80.dp),
                        onClick = { viewModel.onAction(symbol) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
fun CalculatorButton(symbol: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val isOperator = symbol in listOf("/", "*", "-", "+", "=")
    val isAction = symbol in listOf("C", "⌫")

    val backgroundColor = when {
        isOperator -> MaterialTheme.colorScheme.primaryContainer
        isAction -> MaterialTheme.colorScheme.secondaryContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    val textColor = when {
        isOperator -> MaterialTheme.colorScheme.onPrimaryContainer
        isAction -> MaterialTheme.colorScheme.onSecondaryContainer
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(backgroundColor)
            .clickable(onClick = onClick)
    ) {
        Text(
            text = symbol,
            fontSize = 32.sp,
            color = textColor
        )
    }
}
