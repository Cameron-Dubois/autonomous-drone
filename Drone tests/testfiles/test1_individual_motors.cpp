#include <Arduino.h>

#define M1_PWM  4
#define M1_DIR  3
#define M2_PWM  1
#define M2_DIR  5
#define M3_PWM  2
#define M3_DIR  0
#define M4_PWM 18
#define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 2: DIRECTION TEST ===");
  Serial.println("Red props=CW(DIR HIGH), Black=CCW(DIR LOW)");
  
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
  delay(3000);
}

void loop() {
  // CW Test (all HIGH - should lift)
  Serial.println("\nCW TEST (DIR=HIGH all motors)");
  digitalWrite(M1_DIR, HIGH); digitalWrite(M2_DIR, HIGH);
  digitalWrite(M3_DIR, HIGH); digitalWrite(M4_DIR, HIGH);
  analogWrite(M1_PWM, 100); analogWrite(M2_PWM, 100);
  analogWrite(M3_PWM, 100); analogWrite(M4_PWM, 100);
  Serial.println("All motors CW 40% - Should lift straight up ✓");
  delay(2000);
  
  stopAll();
  Serial.println("CW test ✓\n");
  delay(3000);
  
  // CCW Test (all LOW - should lift)  
  Serial.println("CCW TEST (DIR=LOW all motors)");
  digitalWrite(M1_DIR, LOW); digitalWrite(M2_DIR, LOW);
  digitalWrite(M3_DIR, LOW); digitalWrite(M4_DIR, LOW);
  analogWrite(M1_PWM, 100); analogWrite(M2_PWM, 100);
  analogWrite(M3_PWM, 100); analogWrite(M4_PWM, 100);
  Serial.println("All motors CCW 40% - Should lift straight up ✓");
  delay(2000);
  
  stopAll();
  Serial.println("CCW test ✓\n");
  delay(10000);
}

void stopAll() {
  analogWrite(M1_PWM, 0); analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0); analogWrite(M4_PWM, 0);
}
