package com.ecoudea.ecohub

import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Mock Data
data class Track(val title: String, val src: String)
data class Playlist(val id: String, val name: String, val color: Color, val tracks: List<Track>)

val mockPlaylists = listOf(
    Playlist("focus", "Focus · Estudio", Color(0xFF069A7E), listOf(
        Track("Lofi Study 1", "dummy1.mp3"),
        Track("Lofi Study 2", "dummy2.mp3")
    )),
    Playlist("relax", "Relax", Color(0xFF5F4786), listOf(
        Track("Ambient Relax 1", "dummy3.mp3"),
        Track("Nature Sounds", "dummy4.mp3")
    ))
)

@Composable
fun MusicPlayerScreen() {
    var activePlaylistId by remember { mutableStateOf(mockPlaylists[0].id) }
    var trackIndex by remember { mutableStateOf(-1) }
    var isPlaying by remember { mutableStateOf(false) }

    val activePlaylist = mockPlaylists.find { it.id == activePlaylistId } ?: mockPlaylists[0]

    val context = LocalContext.current
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }

    // Manage Media Player Lifecycle
    DisposableEffect(Unit) {
        onDispose {
            mediaPlayer?.release()
        }
    }

    LaunchedEffect(trackIndex) {
        if (trackIndex >= 0 && activePlaylist.tracks.isNotEmpty()) {
            mediaPlayer?.release()

            // In a real app we would play from URI or res/raw.
            // For mock data without actual files, we'll just simulate state
            // and skip actual play so it doesn't crash on "dummy.mp3".
            // mediaPlayer = MediaPlayer.create(context, R.raw.some_music)

            // To simulate playback completion:
            // mediaPlayer?.setOnCompletionListener {
            //     if (trackIndex < activePlaylist.tracks.size - 1) {
            //         trackIndex++
            //     } else {
            //         isPlaying = false
            //     }
            // }

            if (isPlaying) {
                // mediaPlayer?.start()
            }
        } else {
            mediaPlayer?.release()
            mediaPlayer = null
        }
    }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            // mediaPlayer?.start()
        } else {
            // mediaPlayer?.pause()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .windowInsetsPadding(WindowInsets.safeDrawing)
    ) {
        Text("Playlists", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 16.dp)
        ) {
            items(mockPlaylists) { playlist ->
                val isSelected = playlist.id == activePlaylistId
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                    ),
                    modifier = Modifier.clickable {
                        activePlaylistId = playlist.id
                        trackIndex = -1
                        isPlaying = false
                    }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(playlist.color)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(playlist.name, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        Text("Tracks", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))

        LazyColumn(
            modifier = Modifier.weight(1f)
        ) {
            if (activePlaylist.tracks.isEmpty()) {
                item {
                    Text("Playlist vacía", modifier = Modifier.padding(8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                itemsIndexed(activePlaylist.tracks) { index, track ->
                    val isPlayingTrack = index == trackIndex
                    ListItem(
                        headlineContent = { Text(track.title, fontWeight = if (isPlayingTrack) FontWeight.Bold else FontWeight.Normal) },
                        leadingContent = { Text("${index + 1}", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        modifier = Modifier.clickable {
                            trackIndex = index
                            isPlaying = true
                        },
                        colors = ListItemDefaults.colors(
                            containerColor = if (isPlayingTrack) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f) else Color.Transparent
                        )
                    )
                }
            }
        }

        // Mini Player
        if (trackIndex >= 0 && activePlaylist.tracks.isNotEmpty()) {
            val currentTrack = activePlaylist.tracks[trackIndex]

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(currentTrack.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(activePlaylist.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.8f))
                    }

                    IconButton(onClick = {
                        if (trackIndex > 0) {
                            trackIndex--
                            isPlaying = true
                        }
                    }) {
                        Icon(Icons.Default.SkipPrevious, contentDescription = "Previous")
                    }

                    IconButton(
                        onClick = { isPlaying = !isPlaying },
                        modifier = Modifier
                            .size(48.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape)
                    ) {
                        Icon(
                            if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = MaterialTheme.colorScheme.onPrimary
                        )
                    }

                    IconButton(onClick = {
                        if (trackIndex < activePlaylist.tracks.size - 1) {
                            trackIndex++
                            isPlaying = true
                        }
                    }) {
                        Icon(Icons.Default.SkipNext, contentDescription = "Next")
                    }
                }
            }
        }
    }
}
