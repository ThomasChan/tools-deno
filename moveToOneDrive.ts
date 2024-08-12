// 定义 SD 卡和 OneDrive 文件夹的路径
const sdCardPath = '/Volumes/Untitled/MP_ROOT';
const oneDrivePath = '/Users/thomaschan/OneDrive/SonyVideo';

// 检查并创建日期分类的文件夹
async function ensureFolderExists(folderPath) {
  try {
    const stat = await Deno.stat(folderPath);
    if (!stat.isDirectory) {
      console.error(`Error: ${folderPath} is not a directory`);
      Deno.exit(1);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // 如果文件夹不存在，创建文件夹
      await Deno.mkdir(folderPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function run() {
  console.log('Scanning SD card...');
  for await (const entry of Deno.readDir(sdCardPath)) {
    if (entry.isDirectory) {
      const dirPath = `${sdCardPath}/${entry.name}`;
      console.log(`Processing directory: ${dirPath}`);
      for await (const file of Deno.readDir(dirPath)) {
        if (file.isFile) {
          console.log(`Processing file: ${file.name}`);
          try {
            const filePath = `${dirPath}/${file.name}`;
            const fileInfo = await Deno.stat(filePath);
            const createdDate = fileInfo.birthtime || fileInfo.mtime;
            // 移动文件到 OneDrive，并按创建日期分类
            const targetDir = `${oneDrivePath}/${createdDate.getFullYear()}${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
            await ensureFolderExists(targetDir);
            const targetPath = `${targetDir}/${file.name}`;
            await Deno.copyFile(filePath, targetPath);
            await Deno.remove(filePath);
            console.log(`Moved ${file.name} to ${targetPath}`);
          } catch (e) {
            console.log(e.messages)
            console.log(`Unable to copy/remove ${file.name}`);
          }

          // if (filename.endsWith('.jpg')) {
          //   const filePath = `${dirPath}/${file.name}`;
          //   const fileInfo = await Deno.stat(filePath);
          //   const createdDate = fileInfo.birthtime || fileInfo.mtime;
          //   // 移动文件到 OneDrive，并按创建日期分类
          //   const targetDir = `${oneDrivePath}/${createdDate.getFullYear()}${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
          //   await ensureFolderExists(targetDir);
          //   const targetPath = `${targetDir}/${file.name}`;
          //   try {
          //     await Deno.copyFile(filePath, targetPath);
          //     await Deno.remove(filePath);
          //     console.log(`Moved ${file.name} to ${targetPath}`);
          //   } catch (e) {
          //     console.log(e.messages)
          //     console.log(`Unable to copy/remove ${file.name}`);
          //   }
          // } else if (filename.endsWith('.arw')) {
          //   try {
          //     // 删除 .ARW 文件
          //     await Deno.remove(`${dirPath}/${file.name}`);
          //     console.log(`Deleted ${file.name}`);
          //   } catch (e) {
          //     console.log(e.messages)
          //     console.log(`Unable to delete ${file.name}`);
          //   }
          // }
        }
      }
    }
  }
}

run();
