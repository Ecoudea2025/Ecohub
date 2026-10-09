package com.ecoudea.ecohub

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.UUID

data class Evaluation(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val percentage: Float? = null,
    val grade: Float? = null
)

data class Subject(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val credits: Float? = null,
    val evaluations: List<Evaluation> = emptyList()
)

@Composable
fun GradesScreen() {
    val subjects = remember { mutableStateListOf(Subject(name = "Materia 1", credits = 3f, evaluations = listOf(Evaluation(name = "Eval 1", percentage = 100f, grade = 0f)))) }
    var targetGrade by remember { mutableStateOf("4.0") }

    // Calculate global average
    val globalAverage = remember(subjects.toList()) {
        var totalCredits = 0f
        var weightedSum = 0f

        for (subject in subjects) {
            val credits = subject.credits ?: 0f
            var subjectGrade = 0f
            var totalPercentage = 0f
            for (eval in subject.evaluations) {
                val p = eval.percentage ?: 0f
                val g = eval.grade ?: 0f
                subjectGrade += g * (p / 100f)
                totalPercentage += p
            }
            if (totalPercentage > 0) {
                 weightedSum += subjectGrade * credits
                 totalCredits += credits
            }
        }

        if (totalCredits > 0f) weightedSum / totalCredits else 0f
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
    ) {
        // Global Stats Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Promedio Global", color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 14.sp)
                Text(String.format("%.2f", globalAverage), color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 32.sp, fontWeight = FontWeight.Bold)

                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Meta:", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(
                        value = targetGrade,
                        onValueChange = { targetGrade = it },
                        modifier = Modifier.width(80.dp).height(50.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Subjects List
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(subjects, key = { it.id }) { subject ->
                SubjectCard(
                    subject = subject,
                    onDeleteSubject = { subjects.remove(subject) },
                    onAddEvaluation = {
                        val idx = subjects.indexOf(subject)
                        if (idx != -1) {
                            val updatedEvals = subject.evaluations + Evaluation(name = "Nueva Eval")
                            subjects[idx] = subject.copy(evaluations = updatedEvals)
                        }
                    },
                    onDeleteEvaluation = { eval ->
                        val idx = subjects.indexOf(subject)
                        if (idx != -1) {
                            val updatedEvals = subject.evaluations.filter { it.id != eval.id }
                            subjects[idx] = subject.copy(evaluations = updatedEvals)
                        }
                    },
                    onUpdateSubject = { updatedSubject ->
                        val idx = subjects.indexOf(subject)
                        if (idx != -1) {
                            subjects[idx] = updatedSubject
                        }
                    }
                )
            }

            item {
                Button(
                    onClick = { subjects.add(Subject(name = "Nueva Materia")) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Añadir")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Añadir Materia")
                }
            }
        }
    }
}

@Composable
fun SubjectCard(
    subject: Subject,
    onDeleteSubject: () -> Unit,
    onAddEvaluation: () -> Unit,
    onDeleteEvaluation: (Evaluation) -> Unit,
    onUpdateSubject: (Subject) -> Unit
) {
    var subjectName by remember(subject.name) { mutableStateOf(subject.name) }
    var creditsText by remember(subject.credits) { mutableStateOf(subject.credits?.toString() ?: "") }

    val subjectAverage = remember(subject.evaluations) {
        var sum = 0f
        for (eval in subject.evaluations) {
            val p = eval.percentage ?: 0f
            val g = eval.grade ?: 0f
            sum += g * (p / 100f)
        }
        sum
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = subjectName,
                    onValueChange = {
                        subjectName = it
                        onUpdateSubject(subject.copy(name = it))
                    },
                    modifier = Modifier.weight(1f),
                    label = { Text("Materia") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(8.dp))
                OutlinedTextField(
                    value = creditsText,
                    onValueChange = {
                        creditsText = it
                        onUpdateSubject(subject.copy(credits = it.toFloatOrNull()))
                    },
                    modifier = Modifier.width(80.dp),
                    label = { Text("Créditos") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )
                IconButton(onClick = onDeleteSubject) {
                    Icon(Icons.Default.Delete, contentDescription = "Eliminar Materia", tint = MaterialTheme.colorScheme.error)
                }
            }

            Text("Promedio Materia: ${String.format("%.2f", subjectAverage)}", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 8.dp))

            subject.evaluations.forEach { eval ->
                EvaluationRow(
                    evaluation = eval,
                    onDelete = { onDeleteEvaluation(eval) },
                    onUpdateEvaluation = { updatedEval ->
                        val updatedEvals = subject.evaluations.map { if (it.id == eval.id) updatedEval else it }
                        onUpdateSubject(subject.copy(evaluations = updatedEvals))
                    }
                )
            }

            TextButton(onClick = onAddEvaluation) {
                Icon(Icons.Default.Add, contentDescription = "Añadir")
                Text("Añadir Evaluación")
            }
        }
    }
}

@Composable
fun EvaluationRow(
    evaluation: Evaluation,
    onDelete: () -> Unit,
    onUpdateEvaluation: (Evaluation) -> Unit
) {
    var name by remember(evaluation.name) { mutableStateOf(evaluation.name) }
    var percentage by remember(evaluation.percentage) { mutableStateOf(evaluation.percentage?.toString() ?: "") }
    var grade by remember(evaluation.grade) { mutableStateOf(evaluation.grade?.toString() ?: "") }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = name,
            onValueChange = {
                name = it
                onUpdateEvaluation(evaluation.copy(name = it))
            },
            modifier = Modifier.weight(1f),
            label = { Text("Nombre") },
            singleLine = true
        )
        Spacer(modifier = Modifier.width(8.dp))
        OutlinedTextField(
            value = percentage,
            onValueChange = {
                percentage = it
                onUpdateEvaluation(evaluation.copy(percentage = it.toFloatOrNull()))
            },
            modifier = Modifier.width(80.dp),
            label = { Text("%") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true
        )
        Spacer(modifier = Modifier.width(8.dp))
        OutlinedTextField(
            value = grade,
            onValueChange = {
                grade = it
                onUpdateEvaluation(evaluation.copy(grade = it.toFloatOrNull()))
            },
            modifier = Modifier.width(80.dp),
            label = { Text("Nota") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true
        )
        IconButton(onClick = onDelete) {
            Icon(Icons.Default.Delete, contentDescription = "Eliminar", tint = MaterialTheme.colorScheme.error)
        }
    }
}
