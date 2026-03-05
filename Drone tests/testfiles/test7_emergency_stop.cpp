#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3
#define M2_PWM  1  #define M2_DIR  5
#define M3_PWM  2  #define M3_DIR  0
#define M4_PWM 18  #define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 7: EMERGENCY STOP ===");
  Serial.println("Type 'x' for instant stop");
  
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
  delay(3000);
}

void loop() {
  if (Serial.available() && Serial.read() == 'x') {
    stopAll();
    Serial.println("EMERGENCY STOP ✓ - All motors OFF");
    delay(5000);
    return;
  }
  
  Serial.println("Running motors... type 'x' to stop");
  digitalWrite(M1_DIR, HIGH); digitalWrite(M2_DIR, HIGH);
  digitalWrite(M3_DIR, HIGH); digitalWrite(M4_DIR, HIGH);
  analogWrite(M1_PWM, 100); analogWrite(M2_PWM, 100);
  analogWrite(M3_PWM, 100); analogWrite(M4_PWM, 100);
  delay(10000);
  stopAll();
}

void stopAll() {
  analogWrite(M1_PWM, 0); analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0); analogWrite(M4_PWM, 0);
}
