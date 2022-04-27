package server;

import server.model.agents.AgentVirtual;

import java.io.*;
import java.util.logging.Logger;

public class ModelCaller {
    private Thread currentThread = null;
    private Thread underThread = null;
    private Thread overThread = null;
    private Logger LOGGER = Logger.getLogger(ModelCaller.class.getName());
    private String style = "justOn";
    private String webRef;

    public void reset() {
        style = "justOn";
        currentThread = null;
        underThread = null;
        overThread = null;
        Simulator.instance.getState().setMissionSuccessChance(-1);
        Simulator.instance.getState().setMissionSuccessOverChance(-1);
        Simulator.instance.getState().setMissionSuccessUnderChance(-1);
    }

    /**
     * Starts the first run, which in turn runs 1 over and 1 under.
     * Also side effects the chances in State.
     */
    public void startThread(String webRef) {
        this.webRef = webRef;
        // TODO edit the prediction python to take arguments of files, then we can run all 3 in parallel
        if (currentThread != null) {
            currentThread.interrupt();
        }
        if (underThread != null) {
            underThread.interrupt();
        }
        if (overThread != null) {
            overThread.interrupt();
        }

        Simulator.instance.getState().setMissionSuccessChance(-1);
        Simulator.instance.getState().setMissionSuccessOverChance(-1);
        Simulator.instance.getState().setMissionSuccessUnderChance(-1);


        currentThread = new Thread(this::runOn);
        currentThread.start();
        if (style.equals("parallel")) {
            underThread = new Thread(this::runUnder);
            underThread.start();
            overThread = new Thread(this::runOver);
            overThread.start();
        }

    }

    /**
     * Run the script for the model. Used for every run
     * @throws IOException
     * @throws InterruptedException
     */
    private void runScript(String fileName) throws IOException, InterruptedException {
        System.out.println("RUNNNING: " +  webRef+"/ModelFiles/"+fileName);
        ProcessBuilder processBuilder = new ProcessBuilder("python3", webRef+"/ModelFiles/"+fileName, webRef);
        processBuilder.redirectErrorStream(true);
        Process process = processBuilder.start();

        String s;
        BufferedReader stdOut = new BufferedReader(new
                InputStreamReader(process.getInputStream()));
        while ((s = stdOut.readLine()) != null) {
            System.out.println(s);
        }

        int exitCode = process.waitFor();
        System.out.println("RUN - Finished with exit code " + exitCode);
    }

    /**
     * Run a model for the actual number of drones
     */
    public void runOn() {
        try {
            LOGGER.info(String.format("%s; MDSTO; Model starting on the current number of agents;", Simulator.instance.getState().getTime()));
            double startTime = System.nanoTime();
            runScript("current.py");
            double result = readResult("currentResults.txt");
            double boundedResult = readTimeBoundedResult("currentResults_boundedT.txt");
            Simulator.instance.getState().setMissionSuccessChance(result * 100);
            Simulator.instance.getState().setMissionBoundedSuccessChance(boundedResult * 100);
            double elapsed = (System.nanoTime() - startTime) / 10E8;
            LOGGER.info(String.format("%s; MDDNO; Model done on the current number of agents in time (result, elapsed time); %s; %s", Simulator.instance.getState().getTime(), result, elapsed));
        } catch (IOException e) {
            System.out.println("RUN - An IO error occurred.");
        } catch (InterruptedException e) {
            System.out.println("RUN - Process interrupted.");
        }
        //currentThread.interrupt();
        currentThread = null;

        if (style.equals("series")) {
            overThread = new Thread(this::runOver);
            overThread.start();
        }
    }

    /**
     * Run a model for one drone over this number
     */
    private void runOver() {
        //addAgentToParameters();
        try {
            LOGGER.info(String.format("%s; MDSTV; Model starting at 1 over the current number of agents;", Simulator.instance.getState().getTime()));
            runScript("add1drone.py");
            double overResult = readResult("add1results.txt");
            double boundedResult = readTimeBoundedResult("add1results_boundedT.txt");
            Simulator.instance.getState().setMissionSuccessOverChance(overResult * 100);
            Simulator.instance.getState().setMissionBoundedSuccessOverChance(boundedResult * 100);
            LOGGER.info(String.format("%s; MDDNV; Model done at 1 over the current number of agents (result); %s", Simulator.instance.getState().getTime(), overResult));
        } catch (IOException e) {
            System.out.println("RUN OVER - An IO error occurred.");
        } catch (InterruptedException e) {
            System.out.println("RUN OVER - Process interrupted.");
        }
        //overThread.interrupt();
        overThread = null;

        if (style.equals("series")) {
            underThread = new Thread(this::runUnder);
            underThread.start();
        }
    }

    /**
     * Run a model for 1 drone under this number
     */
    private void runUnder() {
        try {
            LOGGER.info(String.format("%s; MDSTU; Model starting at 1 under the current number of agents;", Simulator.instance.getState().getTime()));
            runScript("remove1drone.py");
            double underResult = readResult("remove1results.txt");
            double boundedResult = readTimeBoundedResult("remove1results_boundedT.txt");
            Simulator.instance.getState().setMissionSuccessUnderChance(underResult * 100);
            Simulator.instance.getState().setMissionBoundedSuccessUnderChance(boundedResult * 100);
            LOGGER.info(String.format("%s; MDDNU; Model done at 1 under the current number of agents (result); %s", Simulator.instance.getState().getTime(), underResult));
        } catch (IOException e) {
            System.out.println("RUN UNDER - An IO error occurred.");
        } catch (InterruptedException e) {
            System.out.println("RUN UNDER - Process interrupted.");
        }
        //underThread.interrupt();
        underThread = null;
    }

    /**
     * Add an extra agent to the drones file
     */
    private void addAgentToParameters() {
        try {
            BufferedReader reader = new BufferedReader(
                    new FileReader("drones.txt")
            );
            StringBuilder sb =  new StringBuilder();
            String s;
            while ((s = reader.readLine()) != null) {
                sb.append(s).append("\n");
            }
            reader.close();

            FileWriter myWriter = new FileWriter("drones.txt");
            String rep = "0.0 0.0 1.0 1 0 1 1 \n";
            sb.append(rep);
            myWriter.write(sb.toString());
            //System.out.println("produced: " + sb);
            //System.out.println("Wrote to drones.txt");
            myWriter.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * Remove 2 agents (the just added one, and the last one in the list after)
     */
    private void removeAgentFromParameters() {
        try {
            BufferedReader reader = new BufferedReader(
                    new FileReader("drones.txt")
            );
            StringBuilder sb =  new StringBuilder();
            String s;
            int numAgents = Simulator.instance.getState().getAgents().size(); // We have also added an extra one (+1)
            int i = 0;
            while ((s = reader.readLine()) != null) {
                i++;
                if (i < numAgents - 1) {
                    sb.append(s).append("\n");
                } else {
                    break;
                }

            }

            //System.out.println("produced: " + sb);
            reader.close();

            FileWriter myWriter = new FileWriter("drones.txt");
            myWriter.write(sb.toString());
            //System.out.println("Wrote to drones.txt");
            myWriter.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * Read result from file. In future this may take an argument in future
     * @return
     */
    private double readResult(String fileName) {
        try {
            BufferedReader reader = new BufferedReader(
                    new FileReader(webRef+"/ModelFiles/"+fileName)
            );
            double d = Double.parseDouble(reader.readLine());
            reader.close();
            return d;
        } catch (Exception e) {
            System.out.println("ERROR READING RESULT. RETURNING 0");
            return 0;
        }
    }

    /**
     * Read result from file. In future this may take an argument in future
     * @return
     */
    private double readTimeBoundedResult(String fileName) {
        try {
            BufferedReader reader = new BufferedReader(
                    new FileReader(webRef+"/ModelFiles/"+fileName)
            );

            //e.g 18000	0.998
            String s;
            double d = 0;
            while ((s = reader.readLine()) != null) {
                if (s.contains("18000")) {
                    d = Double.parseDouble(s.split("\t")[1]);
                    break;
                }
            }
            reader.close();
            return d;
        } catch (Exception e) {
            e.printStackTrace();
            System.out.println("ERROR READING RESULT. RETURNING 0");
            return 0;
        }
    }

    public void setStyle(String modelStyle) {
        style = modelStyle;
    }

}
