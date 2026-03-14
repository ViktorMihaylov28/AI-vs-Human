// download_images.js
const fs = require("fs");
const https = require("https");
const path = require("path");

const folder = path.join(__dirname, "images");
if (!fs.existsSync(folder)) {
  fs.mkdirSync(folder);
}

// 20 човешки изображения (Wikimedia / свободни)
const humanImages = [
"https://upload.wikimedia.org/wikipedia/commons/0/0a/The_Great_Wave_off_Kanagawa.jpg",
"https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg",
"https://upload.wikimedia.org/wikipedia/commons/a/a0/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
"https://upload.wikimedia.org/wikipedia/commons/4/4c/Claude_Monet%2C_Impression%2C_soleil_levant.jpg",
"https://upload.wikimedia.org/wikipedia/commons/3/3c/Edvard_Munch_-_The_Scream.jpg",
"https://upload.wikimedia.org/wikipedia/commons/1/15/Girl_with_a_Pearl_Earring.jpg",
"https://upload.wikimedia.org/wikipedia/commons/7/74/Rembrandt_-_The_Nightwatch.jpg",
"https://upload.wikimedia.org/wikipedia/commons/2/24/Leonardo_da_Vinci_-_Mona_Lisa.jpg",
"https://upload.wikimedia.org/wikipedia/commons/b/bc/The_Last_Supper_by_Leonardo_da_Vinci.jpg",
"https://upload.wikimedia.org/wikipedia/commons/0/02/Portrait_of_Adele_Bloch-Bauer_I.jpg",
"https://upload.wikimedia.org/wikipedia/commons/5/50/Vincent_van_Gogh_-_Sunflowers.jpg",
"https://upload.wikimedia.org/wikipedia/commons/d/d7/Guernica_by_Picasso.jpg",
"https://upload.wikimedia.org/wikipedia/commons/4/47/Claude_Monet_-_Water_Lilies.jpg",
"https://upload.wikimedia.org/wikipedia/commons/8/83/Hokusai_Mount_Fuji.jpg",
"https://upload.wikimedia.org/wikipedia/commons/2/2c/Salvador_Dali_The_Persistence_of_Memory.jpg",
"https://upload.wikimedia.org/wikipedia/commons/0/0c/Gustav_Klimt_The_Kiss.jpg",
"https://upload.wikimedia.org/wikipedia/commons/f/f4/Grant_Wood_-_American_Gothic.jpg",
"https://upload.wikimedia.org/wikipedia/commons/5/55/Vermeer_View_of_Delft.jpg",
"https://upload.wikimedia.org/wikipedia/commons/6/6d/Turner_The_Fighting_Temeraire.jpg",
"https://upload.wikimedia.org/wikipedia/commons/1/1f/Monet_Sunrise.jpg"
];

// 20 AI-подобни изображения (генерирани placeholders)
const aiImages = Array.from({ length: 20 }, (_, i) =>
  `https://picsum.photos/seed/ai_${i}/800/600`
);

function download(url, file) {
  const stream = fs.createWriteStream(file);
  https.get(url, (response) => {
    response.pipe(stream);
    stream.on("finish", () => {
      stream.close();
      console.log("Downloaded:", file);
    });
  }).on("error", (err) => {
    console.error("Error downloading", url, err);
  });
}

// Създава 20 въпроса (left/right)
for (let i = 0; i < 20; i++) {
  const leftFile = path.join(folder, `q${i+1}_left.jpg`);
  const rightFile = path.join(folder, `q${i+1}_right.jpg`);

  download(humanImages[i], leftFile);
  download(aiImages[i], rightFile);
}