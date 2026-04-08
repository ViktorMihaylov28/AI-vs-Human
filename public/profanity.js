class ProfanityFilter {
  constructor() {
    this.bannedWords = [
      'fuck', 'shit', 'ass', 'bitch', 'damn', 'hell', 'crap', 'bastard',
      'пък', 'мам', 'тва', 'говно', 'курва', 'педераст', 'педал', 'простак',
      'идиот', 'кретен', 'дебил', 'imbecil', 'idiot', 'stupid', 'dumb',
      'hate', 'kill', 'die', 'death', 'shit', 'crap', 'dick', 'pussy',
      'fucking', 'bullshit', 'asshole', 'faggot', 'nigger', 'retard',
      'мудак', 'мудо', 'мудяк', 'мудаци', 'задник', 'задница', 'azzi',
      'gay', 'lesbian', 'whore', 'slut', 'nazi', 'hitler', 'stalin'
    ];
    
    this.patterns = [
      /\d+/g,
      /[а-яА-Яa-zA-Z0-9]/g
    ];
  }

  containsProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    
    const normalized = text.toLowerCase().trim();
    
    for (const word of this.bannedWords) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'i');
      if (regex.test(normalized)) {
        return true;
      }
      
      if (normalized.includes(word.toLowerCase())) {
        return true;
      }
    }

    const leetSpeak = this.convertLeetSpeak(normalized);
    for (const word of this.bannedWords) {
      if (leetSpeak.includes(word.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  convertLeetSpeak(text) {
    return text
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/0/g, 'o')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's');
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getSuggestions(text) {
    if (!text || text.length < 2) return [];
    
    const normalized = text.toLowerCase().trim();
    const suggestions = [];
    
    const goodAdjectives = ['Звезда', 'Мечо', 'Слънце', 'Вихър', 'Мълния', 'Елф', 'Дракон', 'Феникс', 'Вълк', 'Орел', 'Тигър', 'Лъв', 'Сокол', 'Ястреб', 'Пантера'];
    const animals = ['Панда', 'Лисица', 'Елен', 'Заек', 'Мечка', 'Вълк', 'Орел', 'Сокол', 'Пепелянка', 'Кобра'];
    const colors = ['Червен', 'Син', 'Зелен', 'Жълт', 'Оранжев', 'Виолетов', 'Розов', 'Бял', 'Черен'];
    
    const randomElement = arr => arr[Math.floor(Math.random() * arr.length)];
    suggestions.push(randomElement(goodAdjectives) + Math.floor(Math.random() * 99));
    suggestions.push(randomElement(animals) + Math.floor(Math.random() * 50));
    suggestions.push(randomElement(colors) + ' ' + randomElement(animals));
    
    return suggestions.slice(0, 3);
  }

  filter(text) {
    if (!text) return text;
    let filtered = text;
    
    for (const word of this.bannedWords) {
      const regex = new RegExp(this.escapeRegex(word), 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
    
    return filtered;
  }
}

const ProfanityFilterInstance = new ProfanityFilter();
