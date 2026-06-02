### **Camera Integration**

**Overview**

The drone's camera subsystem serves as the primary output channel of the autonomous filming system. The design goal is to provide a stable, continuous video feed from the drone to the operator's smartphone without requiring manual camera adjustment. The camera is treated as a fixed, forward-facing module; framing is achieved by positioning the drone itself rather than by mechanically actuating the camera. This approach reduces weight, mechanical complexity, and points of failure while remaining consistent with the autonomous follow-me use case.

**Camera Hardware Requirements**

The camera module selected for the product must satisfy the following functional requirements:

| Requirement | Specification |
| ----- | ----- |
| Resolution | Minimum 720p (1280 × 720\) at 30 fps |
| Field of view | 120–150° diagonal to capture the subject at typical follow distances |
| Interface | MIPI CSI or USB UVC; compatible with the onboard MCU or companion processor |
| Latency | End-to-end stream latency ≤ 500 ms under nominal Wi-Fi link conditions |
| Weight | ≤ 15 g including mount hardware |
| Power draw | ≤ 500 mA at 3.3 V or 5 V supply rail |

The camera module must operate without active cooling and must tolerate the vibration environment produced by four spinning motors at operational RPM. The mount must position the lens below the propeller plane and outside the propeller wash to avoid interference and image degradation.

**Video Pipeline**

The camera captures raw frames and encodes them as an MJPEG stream, which is served over the drone's local Wi-Fi soft access point. MJPEG is chosen for the first product version because it is stateless (each frame is a self-contained JPEG), tolerant of packet loss, and straightforward to decode on the mobile app without a hardware decoder. The stream is served over HTTP on a defined endpoint (for example, `http://192.168.4.1:81/stream`) accessible to any client connected to the drone's access point. The mobile application opens this endpoint in the Video tab and renders frames in real time.

The pipeline from sensor to display is:

1. Camera sensor → frame buffer on MCU or companion processor  
2. JPEG compression (hardware-accelerated where available)  
3. HTTP multipart response streamed over Wi-Fi  
4. Mobile app HTTP client decodes and renders each frame

No audio is captured or transmitted in the first product version.

**Integration with the Wireless Link**

The drone operates a dual wireless link: BLE for low-latency commands and keep-alive, and Wi-Fi for telemetry and video. The camera stream uses the Wi-Fi link exclusively. The Wi-Fi access point must be configured with sufficient bandwidth headroom to carry the video stream concurrently with the JSON telemetry channel at its nominal 5 Hz update rate. The product firmware must implement quality-of-service or rate limiting to ensure that telemetry delivery is not starved by camera traffic. The minimum acceptable Wi-Fi throughput allocation for the stream is 2 Mbps sustained; the maximum target is 4 Mbps to leave margin for telemetry and connection overhead.

**Mobile App — Video Tab**

The Video tab in the React Native mobile application provides the operator's view of the camera stream. When the drone's Wi-Fi link is active and the stream endpoint is reachable, the tab renders the MJPEG feed full-screen in landscape orientation. When the stream is unavailable (link not established, drone not powered, or stream not yet started), the tab displays a placeholder state with a reconnect control. The app must not crash or block other tabs if the stream is interrupted; stream loss is treated as a non-critical event, and the operator retains full use of the Control and Home tabs during a video outage.

**Evaluation Criteria**

A camera integration is considered acceptable for the product if it satisfies the following pass criteria:

| Test condition | Pass criterion |
| ----- | ----- |
| Stream present and link stable | The video tab renders a live image within 5 seconds of connecting to the drone Wi-Fi |
| Frame rate under nominal conditions | ≥ 25 fps sustained over a 60-second test window at the reference distance (5 m) |
| Latency | End-to-end latency from scene change to display update ≤ 500 ms |
| Stream interruption recovery | Stream resumes automatically within 10 seconds after a transient link drop without requiring an app restart |
| Concurrent telemetry | Telemetry updates continue at ≥ 4 Hz while the stream is active; no telemetry blackout lasting more than 2 seconds |
| Image quality | The operator can identify a standing person at 5 m under outdoor lighting; no persistent compression artifacts that obscure the subject |

The evaluation does not mandate a specific camera module, compression library, or HTTP server implementation. Those choices are left to the engineers who build the manufactured product. The criteria above define what an acceptable result looks like, regardless of how it is achieved.

**Current Prototype Status**

The Video tab is implemented in the current mobile app, and the stream endpoint is defined in the firmware. In the current prototype, the endpoint returns a placeholder stream because the camera module is not yet fully integrated into the flight hardware. Live camera streaming is listed as "Not yet" in the prototype demonstration table in the Evaluation section. Integration of the physical camera module, including wiring, mount fabrication, and stream endpoint activation, is planned as a Spring Quarter deliverable.

