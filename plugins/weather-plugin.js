const https = require('https');

class WeatherPlugin {
  constructor() {
    this.name = 'Weather';
    this.version = '1.0.0';
    this.enabled = false;
    this.apiKey = process.env.WEATHER_API_KEY || null;
  }

  init() {
    console.log('[Weather] Plugin initialized (API Key: ' + (this.apiKey ? 'set' : 'not set') + ')');
  }

  async onMessage(message, context) {
    const weatherKeywords = ['天气', 'weather', '温度', '下雨'];
    const hasWeatherKeyword = weatherKeywords.some(k => message.toLowerCase().includes(k));
    
    if (hasWeatherKeyword && this.apiKey) {
      try {
        const weather = await this.getWeather(message);
        return {
          message: `当前天气：${weather}`,
          plugin: this.name
        };
      } catch (e) {
        return {
          message: `获取天气失败：${e.message}`,
          plugin: this.name
        };
      }
    }
    
    return null;
  }

  getWeather(query) {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error('Weather API key not configured'));
        return;
      }

      const city = this.extractCity(query);
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.cod === 200) {
              resolve(`${json.name}：${json.main.temp}°C，${json.weather[0].description}`);
            } else {
              reject(new Error(json.message || 'City not found'));
            }
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  extractCity(query) {
    const city = query.replace(/天气|weather|温度|下雨/gi, '').trim();
    return city || 'Beijing';
  }
}

module.exports = WeatherPlugin;
