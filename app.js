const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

module.exports = app;

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeAndDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeAndDbServer();

const convertDbToResponse = (eachObject) => {
  return {
    stateId: eachObject.state_id,
    stateName: eachObject.state_name,
    population: eachObject.population,
  };
};

const convertDbToDistrictResponse = (eachObject) => {
  return {
    districtId: eachObject.district_id,
    districtName: eachObject.district_name,
    stateId: eachObject.state_id,
    cases: eachObject.cases,
    cured: eachObject.cured,
    active: eachObject.active,
    deaths: eachObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(400);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
    *
    FROM
    state;`;
  const stateDetails = await db.all(getStatesQuery);
  response.send(
    stateDetails.map((eachObject) => convertDbToResponse(eachObject))
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDetail = `
    SELECT
    *
    FROM
    state
    WHERE state_id = ${stateId};`;
  const StateDetail = await db.get(getStateDetail);
  response.send(convertDbToResponse(StateDetail));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
    INSERT INTO
    district(district_name,state_id,cases,cured,active,deaths)
    VALUES
    (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );
    `;
  await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT
    *
    FROM
    district
    WHERE
    district_id = ${districtId};`;
    const districtDetail = await db.get(getDistrictQuery);
    response.send(convertDbToDistrictResponse(districtDetail));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM
    district
    WHERE
    district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE 
    district
    SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths};`;
    const districtDetails = await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get("/states/:stateId/stats/", async (request, response) => {
  const { stateId } = request.params;
  const getSummaryQuery = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM
    district
    WHERE
    state_id = ${stateId};`;
  const summaryDetails = await db.get(getSummaryQuery);
  console.log(summaryDetails);
  response.send({
    totalCases: summaryDetails["SUM(cases)"],
    totalCured: summaryDetails["SUM(cured)"],
    totalActive: summaryDetails["SUM(active)"],
    totalDeaths: summaryDetails["SUM(deaths)"],
  });
});
