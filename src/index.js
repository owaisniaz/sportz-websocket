import express from "express";

const app = express();
const port = 8000;

app.use(express.json());

app.get("/", (_request, response) => {
  response.send("Welcome to the server!");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});