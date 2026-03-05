#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 3: SPEED CONTROL (Motor 1) ===");
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  delay(3000);
}

void loop() {
  Serial.println("\n0% → 100% SPEED SWEEP:");
  for(int speed = 0; speed <= 255; speed += 40) {
    digitalWrite(M1_DIR, HIGH);
    analogWrite(M1_PWM, speed);
    Serial.print("Speed "); Serial.print(speed); Serial.println("/255 ✓");
    delay(1200);
  }
  analogWrite(M1_PWM, 0);
  Serial.println("Speed test complete ✓");
  delay(5000);
}
