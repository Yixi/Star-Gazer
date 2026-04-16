/**
 * i18n 初始化配置
 *
 * 使用 i18next + react-i18next，支持中英文切换。
 * 语言偏好保存在 settingsStore（localStorage 持久化）。
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "@/locales/zh.json";
import en from "@/locales/en.json";

/** 从 localStorage 读取 settingsStore 中持久化的语言设置 */
function getPersistedLanguage(): string {
  try {
    const raw = localStorage.getItem("stargazer-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const lang = parsed?.state?.language;
      if (lang === "en" || lang === "zh") return lang;
    }
  } catch {
    // 解析失败忽略
  }
  return "zh";
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getPersistedLanguage(),
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
