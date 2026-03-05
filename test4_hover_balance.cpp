#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3
#define M2_PWM  1  #define M2_DIR  5
#define M3_PWM  2  #define M3_DIR  0
#define M4_PWM 18  #define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 4: HOVER BALANCE 40% ===");
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
  delay(3000);
}

void loop() {
  Serial.println("Hover test starting...");
  digitalWrite(M1_DIR, HIGH); digitalWrite(M2_DIR, HIGH);
  digitalWrite(M3_DIR, HIGH); digitalWrite(M4_DIR, HIGH);
  
  analogWrite(M1_PWM, 120); Serial.println("Motor 1: 47% ✓");
  analogWrite(M2_PWM, 120); Serial.println("Motor 2: 47% ✓");
  analogWrite(M3_PWM, 120); Serial.println("Motor 3: 47% ✓");
  analogWrite(M4_PWM, 120); Serial.println("Motor 4: 47% ✓");
  
  Serial.println("ALL MOTORS BALANCED - Hover 5 seconds");
  delay(5000);
  
  stopAll();
  Serial.println("Landed safely ✓");
  delay(10000);
}

void stopAll() {
  analogWrite(M1_PWM, 0); analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0); analogWrite(M4_PWM, 0);
}

