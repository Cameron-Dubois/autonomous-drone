#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3
#define M2_PWM  1  #define M2_DIR  5
#define M3_PWM  2  #define M3_DIR  0
#define M4_PWM 18  #define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 6: RAMP TEST ===");
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
  delay(3000);
}

void loop() {
  Serial.println("RAMP UP 0→100%");
  for(int i=0; i<=255; i+=20) {
    analogWrite(M1_PWM, i); analogWrite(M2_PWM, i);
    analogWrite(M3_PWM, i); analogWrite(M4_PWM, i);
    Serial.print("Throttle "); Serial.print(i); Serial.println(" ✓");
    delay(300);
  }
  
  Serial.println("RAMP DOWN 100→0%");
  for(int i=255; i>=0; i-=20) {
    analogWrite(M1_PWM, i); analogWrite(M2_PWM, i);
    analogWrite(M3_PWM, i); analogWrite(M4_PWM, i);
    delay(300);
  }
  Serial.println("Ramp complete ✓");
  delay(5000);
}
