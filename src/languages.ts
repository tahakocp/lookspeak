// Boards per language: the letter set, where the word list comes from, and the
// quick phrases a new user starts with. English is the only one with the optional
// language model; SmolLM2 was trained almost only on English.
export interface Language {
  code: string; // BCP 47, also used to pick a speech voice
  name: string;
  letters: string;
  words: string; // path in the built site
  source: string; // hermitdave/FrequencyWords folder, see scripts/words.mjs
  phrases: string[];
}

export const LANGUAGES: Language[] = [
  {
    code: "en", name: "English", letters: "abcdefghijklmnopqrstuvwxyz'", words: "words.txt", source: "en",
    phrases: [
      "yes", "no", "thank you", "I need help", "I am in pain", "I am thirsty",
      "please wait", "I need the bathroom", "I am tired", "I love you", "please call the nurse", "turn me over please",
    ],
  },
  {
    code: "tr", name: "Türkçe", letters: "abcçdefgğhıijklmnoöprsştuüvyz", words: "lang/words-tr.txt", source: "tr",
    phrases: [
      "evet", "hayır", "teşekkür ederim", "yardıma ihtiyacım var", "ağrım var", "susadım",
      "lütfen bekle", "tuvalete gitmem lazım", "yoruldum", "seni seviyorum", "lütfen hemşireyi çağır", "lütfen beni çevir",
    ],
  },
  {
    code: "es", name: "Español", letters: "abcdefghijklmnopqrstuvwxyzáéíóúñü", words: "lang/words-es.txt", source: "es",
    phrases: [
      "sí", "no", "gracias", "necesito ayuda", "me duele", "tengo sed",
      "espera, por favor", "necesito ir al baño", "estoy cansado", "te quiero", "llama a la enfermera, por favor", "dame la vuelta, por favor",
    ],
  },
  {
    code: "de", name: "Deutsch", letters: "abcdefghijklmnopqrstuvwxyzäöüß", words: "lang/words-de.txt", source: "de",
    phrases: [
      "ja", "nein", "danke", "ich brauche Hilfe", "ich habe Schmerzen", "ich habe Durst",
      "bitte warten", "ich muss auf die Toilette", "ich bin müde", "ich liebe dich", "bitte die Pflegekraft rufen", "bitte dreh mich um",
    ],
  },
  {
    code: "fr", name: "Français", letters: "abcdefghijklmnopqrstuvwxyzàâçéèêëîïôûùœ'", words: "lang/words-fr.txt", source: "fr",
    phrases: [
      "oui", "non", "merci", "j'ai besoin d'aide", "j'ai mal", "j'ai soif",
      "attends, s'il te plaît", "je dois aller aux toilettes", "je suis fatigué", "je t'aime", "appelle l'infirmière, s'il te plaît", "je voudrais changer de position",
    ],
  },
  {
    code: "pt", name: "Português", letters: "abcdefghijklmnopqrstuvwxyzáâãàçéêíóôõú", words: "lang/words-pt.txt", source: "pt_br",
    phrases: [
      "sim", "não", "obrigado", "preciso de ajuda", "estou com dor", "estou com sede",
      "espere, por favor", "preciso ir ao banheiro", "estou cansado", "eu te amo", "chame a enfermeira, por favor", "me vire, por favor",
    ],
  },
  {
    code: "it", name: "Italiano", letters: "abcdefghijklmnopqrstuvwxyzàèéìòù'", words: "lang/words-it.txt", source: "it",
    phrases: [
      "sì", "no", "grazie", "ho bisogno di aiuto", "ho dolore", "ho sete",
      "aspetta, per favore", "devo andare in bagno", "sono stanco", "ti voglio bene", "chiama l'infermiera, per favore", "girami, per favore",
    ],
  },
];

export const language = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
