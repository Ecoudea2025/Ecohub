package com.ecoudea.ecohub.ui.screens

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class CalculatorViewModel : ViewModel() {
    private val _display = MutableStateFlow("0")
    val display: StateFlow<String> = _display.asStateFlow()

    private var currentOperation = ""
    private var firstOperand = ""
    private var isNewOperand = true

    fun onAction(action: String) {
        when (action) {
            "C" -> clear()
            "⌫" -> deleteLast()
            "=", "Enter" -> calculateResult()
            "+", "-", "*", "/" -> setOperation(action)
            "." -> appendDecimal()
            else -> appendNumber(action)
        }
    }

    private fun clear() {
        _display.value = "0"
        currentOperation = ""
        firstOperand = ""
        isNewOperand = true
    }

    private fun deleteLast() {
        if (_display.value.length > 1) {
            _display.value = _display.value.dropLast(1)
        } else {
            _display.value = "0"
            isNewOperand = true
        }
    }

    private fun appendNumber(number: String) {
        if (isNewOperand) {
            _display.value = number
            isNewOperand = false
        } else {
            if (_display.value == "0") {
                _display.value = number
            } else {
                _display.value += number
            }
        }
    }

    private fun appendDecimal() {
        if (isNewOperand) {
            _display.value = "0."
            isNewOperand = false
        } else if (!_display.value.contains(".")) {
            _display.value += "."
        }
    }

    private fun setOperation(operation: String) {
        if (firstOperand.isNotEmpty() && !isNewOperand) {
            calculateResult()
        }
        firstOperand = _display.value
        currentOperation = operation
        isNewOperand = true
    }

    private fun calculateResult() {
        if (firstOperand.isEmpty() || currentOperation.isEmpty()) return

        val num1 = firstOperand.toDoubleOrNull() ?: return
        val num2 = _display.value.toDoubleOrNull() ?: return

        val result = when (currentOperation) {
            "+" -> num1 + num2
            "-" -> num1 - num2
            "*" -> num1 * num2
            "/" -> if (num2 != 0.0) num1 / num2 else Double.NaN
            else -> num1
        }

        _display.value = formatResult(result)
        firstOperand = ""
        currentOperation = ""
        isNewOperand = true
    }

    private fun formatResult(result: Double): String {
        if (result.isNaN()) return "Error"
        val stringResult = result.toString()
        return if (stringResult.endsWith(".0")) {
            stringResult.dropLast(2)
        } else {
            stringResult
        }
    }
}
