#include <Arduino.h>
#define M1_PWM  4  #define M1_DIR  3
#define M2_PWM  1  #define M2_DIR  5
#define M3_PWM  2  #define M3_DIR  0
#define M4_PWM 18  #define M4_DIR 19

void setup() {
  Serial.begin(115200);
  Serial.println("=== TEST 5: SERIAL CONTROL ===");
  Serial.println("Type: 1=m1, 2=m2, 3=m3, 4=m4, 0=stop");
  
  pinMode(M1_PWM, OUTPUT); pinMode(M1_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT); pinMode(M2_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT); pinMode(M3_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT); pinMode(M4_DIR, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    Serial.print("CMD: "); Serial.println(cmd);
    
    switch(cmd) {
      case '1': 
        digitalWrite(M1_DIR, HIGH); analogWrite(M1_PWM, 100);
        Serial.println("✓ MOTOR 1 ON"); break;
      case '2': 
        digitalWrite(M2_DIR, HIGH); analogWrite(M2_PWM, 100);
        Serial.println("✓ MOTOR 2 ON"); break;
      case '3': 
        digitalWrite(M3_DIR, HIGH); analogWrite(M3_PWM, 100);
        Serial.println("✓ MOTOR 3 ON"); break;
      case '4': 
        digitalWrite(M4_DIR, HIGH); analogWrite(M4_PWM, 100);
        Serial.println("✓ MOTOR 4 ON"); break;
      case '0': 
        stopAll();
        Serial.println("✓ ALL STOPPED"); break;
    }
  }
}

void stopAll() {
  analogWrite(M1_PWM, 0); analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0); analogWrite(M4_PWM, 0);
}
