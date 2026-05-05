import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class DroneViewModel : ViewModel() {

    private val _droneLocation = MutableStateFlow<DroneLocation?>(null)
    val droneLocation: StateFlow<DroneLocation?> = _droneLocation

    private val _statusMessage = MutableStateFlow("Waiting for drone...")
    val statusMessage: StateFlow<String> = _statusMessage

    private val receiver = DroneGpsReceiver(
        port = 4210,
        onLocationUpdate = { location ->
            _droneLocation.value = location
            _statusMessage.value = if (location.valid)
                "Fix acquired — ${location.sats} satellites"
            else
                "Searching for fix... (${location.sats} sats)"
        },
        onError = { error ->
            _statusMessage.value = error
        }
    )

    init {
        receiver.start(viewModelScope)
    }

    override fun onCleared() {
        super.onCleared()
        receiver.stop()
    }
}
