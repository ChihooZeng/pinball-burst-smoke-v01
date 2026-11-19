"use strict";
const locale=window.PinballI18n,settings=window.PinballRuntime;
const picker=document.querySelector("[data-language]");
function render(){
  locale.apply(document);
  document.title=locale.t("title")+" · "+locale.t("privacy");
  for(const article of document.querySelectorAll("article"))article.hidden=article.lang!==locale.language;
  for(const panel of document.querySelectorAll("[data-operator]"))panel.hidden=!settings?.analytics;
  for(const message of document.querySelectorAll("[data-preview]"))message.hidden=Boolean(settings?.analytics);
  for(const field of document.querySelectorAll("[data-value]"))field.textContent=settings?.[field.dataset.value]||"";
}
picker.addEventListener("change",()=>{if(locale.set(picker.value))render();});
render();
