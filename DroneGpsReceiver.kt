import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket

data class DroneLocation(
    val lat: Double,
    val lng: Double,
    val alt: Float,
    val sats: Int,
    val valid: Boolean
)

class DroneGpsReceiver(
    private val port: Int = 4210,
    private val onLocationUpdate: (DroneLocation) -> Unit,
    private val onError: (String) -> Unit
) {
    private var socket: DatagramSocket? = null
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job = scope.launch(Dispatchers.IO) {
            try {
                socket = DatagramSocket(port)
                val buffer = ByteArray(256)
                val packet = DatagramPacket(buffer, buffer.size)

                while (isActive) {
                    socket!!.receive(packet)
                    val message = String(packet.data, 0, packet.length)
                    parsePacket(message)?.let { location ->
                        withContext(Dispatchers.Main) {
                            onLocationUpdate(location)
                        }
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onError("GPS receiver error: ${e.message}")
                }
            }
        }
    }

    private fun parsePacket(raw: String): DroneLocation? {
        return try {
            val json = JSONObject(raw)
            DroneLocation(
                lat   = json.optDouble("lat", 0.0),
                lng   = json.optDouble("lng", 0.0),
                alt   = json.optDouble("alt", 0.0).toFloat(),
                sats  = json.optInt("sats", 0),
                valid = json.optBoolean("valid", false)
            )
        } catch (e: Exception) {
            null // Malformed packet — silently skip
        }
    }

    fun stop() {
        job?.cancel()
        socket?.close()
    }
}
