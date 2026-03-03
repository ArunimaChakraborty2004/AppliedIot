

#include <ESP8266WiFi.h>

// ===== WiFi Credentials =====
const char* ssid = "Your_WiFi_Name";          // Enter your WiFi name
const char* password = "Your_WiFi_Password";  // Enter your WiFi password

// ===== ThingSpeak Settings =====
const char* server = "api.thingspeak.com";
String apiKey = "YOUR_WRITE_API_KEY";         // Enter your ThingSpeak Write API Key

WiFiClient client;

void setup() {
  Serial.begin(115200);
  delay(10);

  Serial.println("Connecting to WiFi...");
  
  WiFi.begin(ssid, password);

  // Wait for WiFi connection
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected Successfully!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {

  // Read Gas Sensor Value from A0
  int gasValue = analogRead(A0);

  Serial.print("Gas Level: ");
  Serial.println(gasValue);

  // Connect to ThingSpeak Server
  if (client.connect(server, 80)) {
    
    String url = "/update?api_key=" + apiKey + "&field1=" + String(gasValue);

    client.print(String("GET ") + url + " HTTP/1.1\r\n" +
                 "Host: " + server + "\r\n" +
                 "Connection: close\r\n\r\n");

    Serial.println("Data sent to ThingSpeak");
  }
  else {
    Serial.println("Connection to ThingSpeak failed");
  }

  client.stop();

  delay(15000);   // ThingSpeak allows update every 15 seconds
}
