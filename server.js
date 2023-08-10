const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const sharp = require('sharp');
const archiver = require('archiver');
const express = require('express');
const multer = require('multer');
const extract = require('extract-zip');
const app = express();

const port = 8888;
const uploadDirectory = 'uploads/';
const extractedDirectory = 'extracted/';
const compressedSubdirectory = 'compressed';
const outputZipFilename = 'output.zip';

const upload = multer({ dest: uploadDirectory });

async function createDirectoryIfNotExists(directory) {
  try {
    await fsPromises.access(directory);
  } catch {
    await fsPromises.mkdir(directory);
  }
}

// 1. 调整图片质量 (暂时支持PNG JPEG 和 WebP 格式)
//let quality = 80; // 0-100 (100 为最高质量)
// 3. 转换图片格式
const format = 'jpeg';

async function compressImages(directory,  quality = 80) {
  const imagePath = directory
  const compressedDirectory = path.join(directory, compressedSubdirectory);
  await createDirectoryIfNotExists(compressedDirectory);

  const files = await fsPromises.readdir(imagePath)
  for (const file of files.filter(i => i !== compressedSubdirectory)) {
    const filePath = path.join(imagePath, file);
    const fileStats = await fsPromises.stat(filePath);
    console.log(`File: ${file}`);
    console.log('Size:', fileStats.size);
    console.log('Created at:', fileStats.birthtime);
    console.log('Modified at:', fileStats.mtime);
    console.log('filePath', filePath)
    console.log('-----------------------');
    const compressedFilePath = path.join(compressedDirectory, file);
    await sharp(filePath)
      .toFormat(format, { quality })
      .toFile(compressedFilePath);

    console.log(`图片已保存至: ${compressedFilePath}`);
  }
}

async function createZip(directory) {
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });
  const output = fs.createWriteStream(outputZipFilename);
  archive.pipe(output);

  const files = await fsPromises.readdir(directory);
  const images = files.filter(file => path.extname(file).toLowerCase() === '.jpg' || path.extname(file).toLowerCase() === '.png');

  for (const image of images) {
    const imagePath = path.join(directory, image);
    archive.append(fs.createReadStream(imagePath), { name: image });
  }

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.finalize();
  });

  console.log('创建压缩文件成功！');
}

async function deleteDirectory(directory) {
  const files = await fsPromises.readdir(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const fileStats = await fsPromises.stat(filePath);

    if (fileStats.isDirectory()) {
      await deleteDirectory(filePath);
    } else {
      await fsPromises.unlink(filePath);
    }
  }

  await fsPromises.rmdir(directory);
}

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log(req.body, 'req.body---->')
  quality = req.body.quality;
  const outputDir = path.join(__dirname, extractedDirectory);
  const zipFilePath = path.resolve(__dirname, outputZipFilename)
  try {
    await extract(req.file.path, { dir: outputDir })
    const files = await fsPromises.readdir(outputDir)
    //特殊情况处理压缩一个带图片的文件夹
    const filePath = path.join(outputDir, files[0]);
    const fileStats = await fsPromises.stat(filePath);
    console.log(fileStats.isDirectory(), 'fileStats---->')
    const dirName = files.find((i) => i !== 'compressed')
    console.log(dirName, 'dirName---->')
    //直接选择图片压缩成一个zip包的地址outputDir
    const compressedDirectory = fileStats.isDirectory() ? (outputDir + dirName) : outputDir;
    await compressImages(compressedDirectory, Number(quality));
    await createZip(path.join(compressedDirectory, compressedSubdirectory));
    console.log('__dirname', __dirname)
    res.download(zipFilePath, async (err) => {
      if (err) {
        console.error('下载文件出错:', err)
        res.status(500).send('下载文件出错');
      } else {
        fsPromises.unlink(zipFilePath)
      }
    })
  } catch (err) {
    console.error('系统错误:', err);
    res.status(500).send('系统错误');
  } finally {
    await deleteDirectory(outputDir)
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});