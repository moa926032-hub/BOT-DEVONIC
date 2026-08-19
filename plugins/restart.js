const test = async (m, { conn, bot }) => {
  m.react("🟢")
  
  conn.msgUrl(m.chat, "♡゙ Bot is restarting...", { 
    title: "𝑩𝑶𝑻 𝑫𝑬𝑽𝑶𝑵𝑰𝑪 𝘪𝘴 𝘢 𝘞𝘩𝘢𝘵𝘴𝘈𝘱𝘱 𝘣𝘰𝘵 𝘧𝘳𝘰𝘮 𝘵𝘩𝘦 𝘝𝘐𝘐7𝘓𝘐𝘕𝘒 𝘓𝘪𝘣𝘳𝘢𝘳𝘺",
    body: "𝑇𝒉𝑒 𝑏𝑜𝑡 𝑖𝑠 𝑠𝑖𝑚𝑝𝑙𝑒 𝑡𝑜 𝑚𝑜𝑑𝑖𝑓𝑦",
    img: "https://files.catbox.moe/7a9nnf.png",
    big: false 
  });
  
  setTimeout(() => {
    bot.restart();
  }, 1000); 
};

test.usage = ["رستارت"]
test.category = "owner";
test.command = ["رستارت", "restart"];
test.owner = true;
module.exports = test;