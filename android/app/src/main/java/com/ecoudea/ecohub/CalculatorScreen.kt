package com.ecoudea.ecohub

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun CalculatorScreen() {
    var displayValue by remember { mutableStateOf("0") }
    var previousValue by remember { mutableStateOf("") }
    var currentOperation by remember { mutableStateOf<String?>(null) }
    var newOperand by remember { mutableStateOf(true) }

    fun onDigitClick(digit: String) {
        if (newOperand) {
            displayValue = digit
            newOperand = false
        } else {
            if (displayValue == "0" && digit != ".") {
                displayValue = digit
            } else if (digit == "." && displayValue.contains(".")) {
                return
            } else {
                displayValue += digit
            }
        }
    }

    fun onOperatorClick(operator: String) {
        if (currentOperation != null && !newOperand) {
            // calculate previous
            val prev = previousValue.toDoubleOrNull() ?: 0.0
            val current = displayValue.toDoubleOrNull() ?: 0.0
            val result = when (currentOperation) {
                "+" -> prev + current
                "-" -> prev - current
                "*" -> prev * current
                "/" -> if (current != 0.0) prev / current else 0.0
                else -> current
            }
            displayValue = if (result % 1.0 == 0.0) {
                result.toLong().toString()
            } else {
                result.toString()
            }
        }
        previousValue = displayValue
        currentOperation = operator
        newOperand = true
    }

    fun onEqualsClick() {
        if (currentOperation != null) {
            val prev = previousValue.toDoubleOrNull() ?: 0.0
            val current = displayValue.toDoubleOrNull() ?: 0.0
            val result = when (currentOperation) {
                "+" -> prev + current
                "-" -> prev - current
                "*" -> prev * current
                "/" -> if (current != 0.0) prev / current else 0.0
                else -> current
            }
            displayValue = if (result % 1.0 == 0.0) {
                result.toLong().toString()
            } else {
                result.toString()
            }
            currentOperation = null
            newOperand = true
        }
    }

    fun onClearClick() {
        displayValue = "0"
        previousValue = ""
        currentOperation = null
        newOperand = true
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        verticalArrangement = Arrangement.Bottom
    ) {
        // Display
        Text(
            text = previousValue + (currentOperation ?: "") + if (!newOperand) displayValue else "",
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            textAlign = TextAlign.End,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 24.sp
        )
        Text(
            text = displayValue,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp),
            textAlign = TextAlign.End,
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 48.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )

        // Keypad
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CalculatorButton("C", Modifier.weight(1f), MaterialTheme.colorScheme.error) { onClearClick() }
            CalculatorButton("(", Modifier.weight(1f), MaterialTheme.colorScheme.surfaceVariant) { }
            CalculatorButton(")", Modifier.weight(1f), MaterialTheme.colorScheme.surfaceVariant) { }
            CalculatorButton("/", Modifier.weight(1f), MaterialTheme.colorScheme.primary) { onOperatorClick("/") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CalculatorButton("7", Modifier.weight(1f)) { onDigitClick("7") }
            CalculatorButton("8", Modifier.weight(1f)) { onDigitClick("8") }
            CalculatorButton("9", Modifier.weight(1f)) { onDigitClick("9") }
            CalculatorButton("*", Modifier.weight(1f), MaterialTheme.colorScheme.primary) { onOperatorClick("*") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CalculatorButton("4", Modifier.weight(1f)) { onDigitClick("4") }
            CalculatorButton("5", Modifier.weight(1f)) { onDigitClick("5") }
            CalculatorButton("6", Modifier.weight(1f)) { onDigitClick("6") }
            CalculatorButton("-", Modifier.weight(1f), MaterialTheme.colorScheme.primary) { onOperatorClick("-") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CalculatorButton("1", Modifier.weight(1f)) { onDigitClick("1") }
            CalculatorButton("2", Modifier.weight(1f)) { onDigitClick("2") }
            CalculatorButton("3", Modifier.weight(1f)) { onDigitClick("3") }
            CalculatorButton("+", Modifier.weight(1f), MaterialTheme.colorScheme.primary) { onOperatorClick("+") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CalculatorButton("0", Modifier.weight(2f)) { onDigitClick("0") }
            CalculatorButton(".", Modifier.weight(1f)) { onDigitClick(".") }
            CalculatorButton("=", Modifier.weight(1f), MaterialTheme.colorScheme.primary) { onEqualsClick() }
        }
    }
}

@Composable
fun CalculatorButton(
    text: String,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier
            .aspectRatio(if (text == "0") 2.1f else 1f)
            .padding(2.dp),
        colors = ButtonDefaults.buttonColors(containerColor = containerColor),
        shape = RoundedCornerShape(24.dp)
    ) {
        Text(
            text = text,
            fontSize = 24.sp,
            color = if (containerColor == MaterialTheme.colorScheme.primary || containerColor == MaterialTheme.colorScheme.error) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
        )
    }
}
