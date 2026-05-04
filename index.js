require('dotenv').config(); 
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs'); 

const app = express();

const swaggerDocument = YAML.load('./swagger.yaml');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
});

const PORT = process.env.PORT || 3000;
const cacheDir = path.resolve(__dirname, 'cache');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/cache', express.static(cacheDir));

app.get('/RegisterForm.html', (req, res) => res.sendFile(path.join(__dirname, 'RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.join(__dirname, 'SearchForm.html')));

// POST /register - Реєстрація в БД
app.post('/register', async (req, res) => {
    const { inventory_name, description } = req.body;
    if (!inventory_name) return res.status(400).send('inventory_name is required');

    let photoName = null;
    let photoPath = null;

    if (req.files && req.files.photo) {
        const photo = req.files.photo;
        photoName = `${Date.now()}_${photo.name}`;
        photoPath = path.join(cacheDir, photoName);
        await photo.mv(photoPath);
    }

    try {
        const result = await pool.query(
            'INSERT INTO inventory (inventory_name, description, photo_path) VALUES ($1, $2, $3) RETURNING *',
            [inventory_name, description || "", photoPath]
        );
        
        const newItem = result.rows[0];
        newItem.photo_url = photoName ? `http://${req.hostname}:${PORT}/inventory/${newItem.id}/photo` : null;
        res.status(201).json(newItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /inventory - Список з БД
app.get('/inventory', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, inventory_name, description FROM inventory');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /inventory/:id/photo - Отримання фото з диска
app.get('/inventory/:id/photo', async (req, res) => {
    try {
        const result = await pool.query('SELECT photo_path FROM inventory WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0 || !result.rows[0].photo_path) {
            return res.status(404).send('Photo Not Found');
        }
        res.status(200).sendFile(result.rows[0].photo_path);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /search - Пошук у БД
app.post('/search', async (req, res) => {
    const { id, has_photo } = req.body;
    try {
        const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Not Found');

        let item = result.rows[0];
        if (has_photo !== 'on') delete item.photo_path;
        
        res.status(200).json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /inventory/:id - Видалення з БД
app.delete('/inventory/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).send('Not Found');
        res.status(200).send('Deleted successfully');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущено: http://localhost:${PORT}`);
    console.log(`Документація Swagger: http://localhost:${PORT}/docs`);
    console.log(`Для дебагу відкрийте edge://inspect/#devices`);
});