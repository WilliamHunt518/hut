package server;

import server.model.Coordinate;
import server.model.State;
import server.model.agents.Agent;
import server.model.agents.AgentVirtual;
import server.model.agents.Hub;
import server.model.task.Task;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Generates the model files for PRISM to run on
 */
public class ModelGenerator {

    /**
     * Run generator to create files for the current number of agents
     * @param state
     * @param webRef
     * @return
     */
    public static ArrayList<double[][]> run(State state, String webRef) {
        double[][] droneRep = generateDroneRep(state);
        double[][] taskRep = generateTaskRep(state);
        ArrayList<double[][]> configTuple =  new ArrayList<>(2);
        configTuple.add(droneRep);
        configTuple.add(taskRep);
        return configTuple;
        //return generate(droneRep, taskRep, webRef+"/ModelFiles/currentDrones.txt", webRef+"/ModelFiles/currentTasks.txt");
    }

    /**
     * Run generator to create files for the current number of agents plus 1
     * @return
     */
    public static ArrayList<double[][]> runOver(ArrayList<double[][]> generatedCurrent) {
        double[][] newDroneRep = Arrays.copyOf(generatedCurrent.get(0), generatedCurrent.get(0).length + 1);
        newDroneRep[generatedCurrent.get(0).length] = new double[] {0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0};

        ArrayList<double[][]> configTuple =  new ArrayList<>(2);
        configTuple.add(newDroneRep);
        configTuple.add(generatedCurrent.get(1));
        return configTuple;
    }

    /**
     * Run generator to create files for the current number of agents minus 1
     * @return
     */
    public static ArrayList<double[][]> runUnder(ArrayList<double[][]> generatedCurrent) {
        double[][] newDroneRep = Arrays.copyOf(generatedCurrent.get(0), generatedCurrent.get(0).length - 1);
        ArrayList<double[][]> configTuple =  new ArrayList<>(2);
        configTuple.add(newDroneRep);
        configTuple.add(generatedCurrent.get(1));
        return configTuple;
    }

    /**
     * The actual code used to generate the model parameter files
     * @param droneRep
     * @param taskRep
     * @param dronesFileName
     * @param tasksFileName
     * @return
     */
    public static boolean generate(String droneRep, String taskRep, String dronesFileName, String tasksFileName) {
        try {
            FileWriter myWriter = new FileWriter(dronesFileName);
            myWriter.write(droneRep);
            myWriter.close();
            //System.out.println("Wrote to "+dronesFileName);

            myWriter = new FileWriter(tasksFileName);
            myWriter.write(taskRep);
            myWriter.close();
            //System.out.println("Wrote to "+tasksFileName);
        } catch (IOException e) {
            System.out.println("An error occurred.");
            e.printStackTrace();
            return false;
        }
        return true;
    }

    /**
     * Generate a representation of the current drone state
     * @param state
     * @return
     */
    public static double[][] generateDroneRep(State state) {
        //StringBuilder sb = new StringBuilder();
        int i = 0;
        double[][] droneRep = new double[state.getAgents().size() - 1][8];
        Coordinate hubloc = Simulator.instance.getState().getHubLocation();
        for (Agent a : state.getAgents()) {
            if (!(a instanceof Hub) && ((AgentVirtual) a).isAlive()) {
                double dLoc = hubloc.getDistance(a.getCoordinate());
                double taskLoc;
                if (a.getTask() != null) {
                    taskLoc = hubloc.getDistance(a.getTask().getCoordinate());
                } else {
                    taskLoc = -1;  // -1 if no task
                }

                if (!a.getType().equals("withpack")) {  // if delivered
                    taskLoc = 0;  // 0 if delivered
                }

                double bat = a.getBattery();
                int delivered = !a.getType().equals("withpack") ? 1 : 0;
                int recharge = ((AgentVirtual) a).isCharging() ? 1 : 0;
                int returning = ((AgentVirtual) a).isGoingHome() ? 1 : 0;
                int alive = ((AgentVirtual) a).isAlive() ? 1 : 0;
                int needsToTurn;
                if ((a).getRoute().isEmpty() || ((AgentVirtual) a).isGoingHome()) {
                    needsToTurn = 1;
                    //System.out.println(a.getId() + " cond 1; taskid="+a.getAllocatedTaskId());
                } else {
                    needsToTurn = Math.abs(((AgentVirtual) a).calculateAngleToGoal() - Math.toRadians(a.getHeading())) > 0.3F ? 1 : 0;
                    //System.out.println(a.getId() + " cond 2; angle="+(((AgentVirtual) a).calculateAngleToGoal() - Math.toRadians(a.getHeading()))+" ntt="+needsToTurn);
                }

                //int needsToTurn = ((AgentVirtual) a).calculateAngleToGoal() > 0.1F ? 1 : 0;
                droneRep[i] = new double[]{dLoc, taskLoc, bat, delivered, recharge, returning, alive, needsToTurn};
                i++;
            }
        }
        return droneRep;
    }

    /**
     * Generate a representation of the current task state
     * @param state
     * @return
     */
    public static double[][] generateTaskRep(State state) {
        int i = 0;
        double[][] taskRep = new double[state.getTasks().size()][1];
        Coordinate hubloc = Simulator.instance.getState().getHubLocation();
        for (Task t : state.getTasks()) {
            double offset = Simulator.instance.getState().calculateRandomValueFor("locationNoise");
            double tLoc = hubloc.getDistance(t.getCoordinate()) + offset;
            taskRep[i] = new double[]{tLoc};
            i++;
        }
        return taskRep;
    }

}
