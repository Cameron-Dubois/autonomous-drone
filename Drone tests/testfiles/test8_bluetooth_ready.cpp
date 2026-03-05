#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3
#define M2_PWM  1  #define M2_DIR  5
#define M3_PWM  2  #define M3_DIR  0
#define M4_PWM 18  #define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 8: BLUETOOTH READY ===");
  Serial.println("All motors responding to serial (app next)");
  
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readString();
    cmd.trim();
    
    if(cmd == "M1ON") { digitalWrite(M1_DIR, HIGH); analogWrite(M1_PWM, 100); Serial.println("✓ M1 Bluetooth ON"); }
    if(cmd == "M2ON") { digitalWrite(M2_DIR, HIGH); analogWrite(M2_PWM, 100); Serial.println("✓ M2 Bluetooth ON"); }
    if(cmd == "M3ON") { digitalWrite(M3_DIR, HIGH); analogWrite(M3_PWM, 100); Serial.println("✓ M3 Bluetooth ON"); }
    if(cmd == "M4ON") { digitalWrite(M4_DIR, HIGH); analogWrite(M4_PWM, 100); Serial.println("✓ M4 Bluetooth ON"); }
    if(cmd == "STOP") { stopAll(); Serial.println("✓ Bluetooth STOP"); }
  }
}

void stopAll() {
  analogWrite(M1_PWM, 0); analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0); analogWrite(M4_PWM, 0);
}
