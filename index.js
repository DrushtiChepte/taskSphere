import express from "express";
import bodyParser from "body-parser";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const port = 3000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL || {
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT || 5432,
  },
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});
db.connect();
export default db;

let lists = {
  personal: [],
  work: [],
  completed: [],
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

app.get("/", async (req, res) => {
  const today = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const day = today.toLocaleDateString("en-US", options);
  // Calendar logic
  const { month: queryMonth, year: queryYear } = req.query;

  let year = queryYear ? parseInt(queryYear) : today.getFullYear();
  let month = queryMonth ? parseInt(queryMonth) : today.getMonth();

  const calendarData = generateCalendar(month, year);

  const result = await db.query("SELECT * FROM lists");
  let newListItems = result.rows.filter(
    (item) => !["personal", "work", "completed"].includes(item.type)
  );

  //calendar tasks management
  const calendarTasksResult = await db.query(
    "SELECT id, TO_CHAR(date, 'DD-MM-YYYY') AS date, task FROM calendar_tasks"
  );
  const calendarTasks = calendarTasksResult.rows;
  const dates = calendarTasksResult.rows.map((row) => row.date);

  res.render("index.ejs", {
    newItem: newListItems,
    year: year,
    months: months,
    calendarData: calendarData,
    month: month,
    currDate: day,
    calendarTasks: calendarTasks,
    dates: dates,
  });
});

function generateCalendar(month, year) {
  const start = new Date(year, month, 1).getDay();
  const endDate = new Date(year, month + 1, 0).getDate();
  const end = new Date(year, month, endDate).getDay();
  const endDateprev = new Date(year, month, 0).getDate();

  const dates = [];

  for (let i = start; i > 0; i--) {
    dates.push({ day: endDateprev - i + 1, className: "inactive" });
  }

  for (let i = 1; i <= endDate; i++) {
    const today = new Date();
    const isToday =
      i === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear();
    dates.push({ day: i, className: isToday ? "today" : "" });
  }

  for (let i = end; i < 6; i++) {
    dates.push({ day: i - end + 1, className: "inactive" });
  }

  return dates;
}

//accessing calendar tasks wrt dates
app.post("/tasks", async (req, res) => {
  const { taskDate } = req.body;
  console.log("Received taskDate:", taskDate);

  const [day, monthName, year] = taskDate.split("-");
  const monthNumber = new Date(`${monthName} 1`).getMonth() + 1;
  const formattedDate = `${year}-${monthNumber
    .toString()
    .padStart(2, "0")}-${day}`;

  console.log("Formatted taskDate:", formattedDate);

  try {
    const result = await db.query(
      "SELECT * FROM calendar_tasks WHERE date = $1",
      [formattedDate]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

//posting tasks in calendar
app.post("/add-tasks", async (req, res) => {
  let task = req.body.task;
  let date = req.body.date;
  try {
    const result = await db.query(
      "INSERT INTO calendar_tasks (date,task) VALUES ($1,$2) RETURNING *",
      [date, task]
    );
    console.log("Inserted Task:", result.rows[0]);
    res.redirect("/");
  } catch (err) {
    console.error("Error inserting task:", err);
    res.status(500).send("Error saving task.");
  }
});

//delete tasks in calendar
app.post("/delete-task", async (req, res) => {
  const { id } = req.body;

  try {
    await db.query("DELETE FROM calendar_tasks WHERE id = $1", [id]);
    res.json({ message: `Task with ID ${id} deleted successfully!` });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

//Adding list type in sidebar
app.post("/newlist", async (req, res) => {
  let newItems = req.body.addlist;
  try {
    const result = await db.query("INSERT INTO lists (type) VALUES ($1)", [
      newItems,
    ]);
  } catch (err) {
    console.log(err, "error creating list type");
  }
  res.redirect("/");
});
//deleting list in sidebar
app.post("/delete", async (req, res) => {
  const itemId = req.body.id;
  console.log(itemId);
  try {
    const result = await db.query("DELETE FROM lists WHERE id = $1", [itemId]);
    console.log(`Item with id ${itemId} deleted`);
  } catch (err) {
    console.log(err, "error deleting list item");
  }
  res.redirect("/");
});

app.get("/dashboard", (req, res) => {
  res.redirect("/");
});

app.get("/:listType", async (req, res) => {
  const listType = req.params.listType;
  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    if (listTypeResult.rows.length === 0) {
      return res.status(404).send("List not found");
    }

    const listType_id = listTypeResult.rows[0].id;

    try {
      const result = await db.query("SELECT * FROM tasks WHERE list_id = $1", [
        listType_id,
      ]);
      const tasks = result.rows;

      res.render("index2.ejs", {
        listType: listType,
        items: tasks,
        newItem: [listType],
      });
    } catch (err) {
      console.log(err);
      res.status(404).send("Error fetching tasks");
    }
  } catch (err) {
    console.log(err);
    res.status(404).send("Error fetching list ID");
  }
});

//post tasks
app.post("/:listType/post", async (req, res) => {
  const listType = req.params.listType;
  let newTask = req.body.task;

  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    const listType_id = listTypeResult.rows[0].id;

    try {
      const result = await db.query(
        "INSERT INTO tasks (task , list_id) VALUES ($1 , $2)",
        [newTask, listType_id]
      );
    } catch (err) {
      console.log(err);
      res.status(404).send("List not found");
    }
  } catch (err) {
    console.log(err);
    res.status(404).send("Error fetching list ID");
  }
  res.redirect(`/${listType}`);
});

/*delete*/
// app.post("/:listType/delete",async (req, res) => {
//   const listType = req.params.listType;
//   const index = req.body.index;

//   try{
//     const listTypeResult = await db.query("SELECT id FROM lists WHERE type = $1",
//       [listType]
//     )
//     const listType_id = listTypeResult.rows[0].id;

//     try{
//       const taskIdResult = await db.query("SELECT id FROM tasks WHERE list_id = $1",
//         [listType_id]
//       )

//       const task_id = taskIdResult.rows[0].id;
//       try{
//         const result = await db.query("DELETE FROM tasks WHERE id = $1",
//           [task_id]
//         )
//       }catch(err){
//         console.log(err);
//         res.status(500).send("Error deleting task");
//       }

//     }catch(err){
//       console.log(err)
//     }
//   }catch(err){
//     console.log(err);
//     console.log("error finding list id")
//   }

//   // if (lists[listType] && index >= 0 && index < lists[listType].length) {
//   //   lists[listType].splice(index, 1); // Remove the item at the given index
//   // }
//   res.redirect(`/${listType}`);
// });

app.post("/:listType/delete", async (req, res) => {
  const listType = req.params.listType;
  const index = parseInt(req.body.index);
  try {
    const listTypeResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      [listType]
    );
    const listType_id = listTypeResult.rows[0].id;

    const taskResult = await db.query(
      "SELECT id FROM tasks WHERE list_id = $1 ORDER BY id ASC LIMIT 1 OFFSET $2",
      [listType_id, index]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).send("Task not found");
    }

    const task_id = taskResult.rows[0].id;

    await db.query("DELETE FROM tasks WHERE id = $1", [task_id]);
    console.log(`Task with ID ${task_id} deleted successfully.`);
    res.redirect(`/${listType}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting task");
  }
});

/*Completed list */
// app.post("/:listType/complete", (req, res) => {
//   const listType = req.params.listType;
//   const index = req.body.index;
//   if (lists[listType] && index >= 0 && index < lists[listType].length) {
//     const completeItems = lists[listType].splice(index, 1)[0];
//     lists.completed.push(completeItems);
//   }
//   res.redirect(`/${listType}`);
// });
app.post("/:listType/complete", async (req, res) => {
  const listType = req.params.listType;
  const index = parseInt(req.body.index);
  try {
    const result = await db.query(
      "SELECT id FROM tasks WHERE list_id = (SELECT id FROM lists WHERE type = $1) ORDER BY id ASC LIMIT 1 OFFSET $2",
      [listType, index]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("Task not found");
    }

    const taskId = result.rows[0].id;

    const completedListResult = await db.query(
      "SELECT id FROM lists WHERE type = $1",
      ["completed"]
    );
    const completedListId = completedListResult.rows[0].id;

    await db.query("UPDATE tasks SET list_id = $1 WHERE id = $2", [
      completedListId,
      taskId,
    ]);

    res.redirect(`/${listType}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error marking task as completed");
  }
});

app.listen(port, () => {
  console.log(`API is running at http://localhost:${port}`);
});
