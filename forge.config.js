module.exports = {
  packagerConfig: {
    name: 'Modpack Assist',
    executableName: 'modpack-assist',
    asar: true,
    appBundleId: 'com.modpack.assist',
    win32metadata: {
      CompanyName: 'Modpack Assist',
      FileDescription: 'Gestor de Modpacks para Minecraft',
      ProductName: 'Modpack Assist'
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'ModpackAssist',
        setupExe: 'ModpackAssist-Setup.exe'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    }
  ]
};