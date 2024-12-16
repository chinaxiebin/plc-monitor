import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import importExport from '../import-export';

const router = Router();
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

// 确保上传目录存在
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 下载配置模板
router.get('/template', async (req, res) => {
    try {
        const templatePath = path.join(process.cwd(), 'data', 'templates', 'config.xlsx');
        await importExport.exportTemplate(templatePath);
        res.download(templatePath);
    } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// 导入配置
router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        await importExport.importExcel(req.file.path);
        // 删除上传的文件
        fs.unlinkSync(req.file.path);
        res.json({ message: 'Configuration imported successfully' });
    } catch (error) {
        console.error('Error importing configuration:', error);
        // 清理上传的文件
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to import configuration' });
    }
});

// 导出当前配置
router.get('/export', async (req, res) => {
    try {
        const exportPath = path.join(process.cwd(), 'data', 'exports', 'current_config.xlsx');
        // 确保导出目录存在
        const exportDir = path.dirname(exportPath);
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        await importExport.exportConfig(exportPath);
        res.download(exportPath);
    } catch (error) {
        console.error('Error exporting configuration:', error);
        res.status(500).json({ error: 'Failed to export configuration' });
    }
});

export default router;
