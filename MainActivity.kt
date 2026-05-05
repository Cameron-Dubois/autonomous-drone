import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    private val viewModel: DroneViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DroneTrackerUI(viewModel)
        }
    }
}

@Composable
fun DroneTrackerUI(viewModel: DroneViewModel) {
    val location by viewModel.droneLocation.collectAsState()
    val status by viewModel.statusMessage.collectAsState()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Drone GPS", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(8.dp))
            Text(status, style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.height(32.dp))

            if (location != null && location!!.valid) {
                CoordinateCard("Latitude",  "%.6f°".format(location!!.lat))
                Spacer(modifier = Modifier.height(12.dp))
                CoordinateCard("Longitude", "%.6f°".format(location!!.lng))
                Spacer(modifier = Modifier.height(12.dp))
                CoordinateCard("Altitude",  "%.1f m".format(location!!.alt))
                Spacer(modifier = Modifier.height(12.dp))
                CoordinateCard("Satellites", "${location!!.sats}")
            } else {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(12.dp))
                Text("Waiting for GPS fix...")
            }
        }
    }
}

@Composable
fun CoordinateCard(label: String, value: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            Text(value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
