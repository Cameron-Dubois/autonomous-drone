### **Server Infrastructure**

The product includes a cloud-hosted server that supports mobile application authentication and over-the-air app update delivery. The server is not in the path of flight-critical operations; all real-time communication between the mobile app and the drone occurs over the direct local wireless link and does not pass through the server.

**Server Responsibilities**

The server is responsible for three categories of function. First, authentication: the mobile application must obtain a valid session token before accessing protected endpoints. Second, version checking: the app queries the server to determine whether the installed version meets the current minimum requirement. Third, update routing: when an update is available, the server identifies the correct release channel so the app update system can deliver the new build to the user's device.

**API Endpoints**

The server exposes a REST API consumed solely by the mobile application. The table below defines the required endpoints.

| Method | Endpoint | Auth Required | Description |
| ----- | ----- | ----- | ----- |
| GET | / | No | Health check: confirms server is reachable |
| POST | /register | No | Create a new user account with hashed credentials |
| POST | /login | No | Authenticate a user and return a session token |
| GET | /version | Yes | Return the current minimum required app version and release notes |
| GET | /update | Yes | Return the release channel identifier for the app update system |

**User Accounts**

The server must support user registration and persistent credential storage. Passwords must be stored as hashed values; plaintext storage is not acceptable. A registered account is required before the mobile application can obtain a session token or access any protected endpoint. Unauthenticated requests to protected endpoints must be rejected with an appropriate error response.

**App Update Delivery**

The server does not distribute app binaries directly. It returns a release channel identifier that the mobile app's update system uses to pull the correct build. The server is responsible only for determining whether an update exists and which channel to pull from; the delivery mechanism is handled externally by the app distribution system. The server must allow an administrator to update the minimum version value and release channel without redeploying the full server.

**Availability**

Because the server is not in the path of flight operations, brief outages do not affect drone safety. The server must be reachable during account registration, login, and version checks. Once a valid session token is obtained, the mobile app must be able to operate without continuous server contact.

**Evaluation Criteria**

A manufactured system satisfies the server requirement if:

* A new user can register an account, and a valid session token is returned upon subsequent login.  
* An authenticated request to /version returns the correct minimum version string and release notes.  
* An authenticated request to /update returns the correct release channel identifier.  
* An unauthenticated request to any protected endpoint is rejected.  
* Passwords are not stored or logged in plaintext at any point.  
* An administrator can update the minimum version and release channel without a full server redeployment.

