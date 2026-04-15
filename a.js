// Prueba directa de API de CurseForge (Node.js)
const API_KEY = '$2a$10$e8JaO6E5tXoo0ygUDpETIOnaTMDDC3Og6Cp8KavfjoaqyKejw/chm'; // <- USA COMILLAS SIMPLES

async function probarLlave() {
    console.log("⏳ Conectando con CurseForge...");
    
    try {
        // Buscamos el juego Minecraft (gameId=432)
        const response = await fetch('https://api.curseforge.com/v1/games/432', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'x-api-key': API_KEY
            }
        });

        if (response.ok) {
            console.log("✅ ¡ÉXITO! Tu llave de CurseForge es válida y está funcionando.");
        } else {
            const error = await response.text();
            console.log(`❌ ERROR ${response.status}: CurseForge rechazó tu llave.`);
            console.log(`Detalle: ${error}`);
            console.log("\n-> Si dice 'Forbidden', la llave no sirve, está baneada o no te has suscrito al plan gratuito en la consola.");
        }
    } catch (error) {
        console.log("❌ Error de red:", error.message);
    }
}

probarLlave();