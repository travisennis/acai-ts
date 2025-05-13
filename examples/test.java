package com.example;

import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

// Single-line comment

/*
 * Multi-line comment
 */

/**
 * Javadoc comment
 */
@Deprecated
public class Test {

    // Fields
    private int privateField = 10;
    public static final String CONSTANT_STRING = "Hello";
    protected double protectedField;
    String packagePrivateField; // package-private

    // Static initializer block
    static {
        System.out.println("Static initializer block executed.");
    }

    // Instance initializer block
    {
        System.out.println("Instance initializer block executed.");
    }

    // Constructor
    public Test(double protectedField, String packagePrivateField) {
        this.protectedField = protectedField;
        this.packagePrivateField = packagePrivateField;
        System.out.println("Constructor called.");
    }

    // Overloaded constructor
    public Test() {
        this(0.0, "default"); // Calls the other constructor
    }

    // Main method - entry point
    public static void main(String[] args) {
        System.out.println(CONSTANT_STRING + " World!");

        Test testInstance = new Test(5.5, "instance");
        testInstance.instanceMethod("Parameter for instance method");

        // Primitive types
        int anInt = 100;
        long aLong = 1234567890L;
        float aFloat = 3.14f;
        double aDouble = 2.71828;
        boolean aBoolean = true;
        char aChar = 'A';
        byte aByte = 127;
        short aShort = 32000;

        // String
        String greeting = "This is a string.";

        // Array
        int[] numbers = {1, 2, 3, 4, 5};
        String[] words = new String[3];
        words[0] = "Java";
        words[1] = "is";
        words[2] = "fun";

        // Control Flow
        // If-else
        if (anInt > 50) {
            System.out.println("anInt is greater than 50");
        } else if (anInt < 50) {
            System.out.println("anInt is less than 50");
        } else {
            System.out.println("anInt is 50");
        }

        // For loop
        System.out.println("For loop:");
        for (int i = 0; i < numbers.length; i++) {
            System.out.print(numbers[i] + " ");
        }
        System.out.println();

        // Enhanced for loop (for-each)
        System.out.println("Enhanced for loop:");
        for (String word : words) {
            System.out.print(word + " ");
        }
        System.out.println();

        // While loop
        System.out.println("While loop:");
        int count = 0;
        while (count < 3) {
            System.out.println("Count is " + count);
            count++;
        }

        // Do-while loop
        System.out.println("Do-while loop:");
        int doWhileCount = 0;
        do {
            System.out.println("DoWhileCount is " + doWhileCount);
            doWhileCount++;
        } while (doWhileCount < 0); // Condition is false initially, but runs once

        // Switch statement
        char grade = 'B';
        switch (grade) {
            case 'A':
                System.out.println("Excellent!");
                break;
            case 'B':
            case 'C':
                System.out.println("Well done");
                break;
            case 'D':
                System.out.println("You passed");
            case 'F':
                System.out.println("Better try again");
                break;
            default:
                System.out.println("Invalid grade");
        }
        
        // Ternary operator
        String result = (anInt > 10) ? "Greater than 10" : "Not greater than 10";
        System.out.println(result);

        // Generics
        List<String> stringList = new ArrayList<>();
        stringList.add("Apple");
        stringList.add("Banana");
        System.out.println("List: " + stringList);

        Map<Integer, String> map = new HashMap<>();
        map.put(1, "One");
        map.put(2, "Two");
        System.out.println("Map: " + map);

        // Exception Handling
        try {
            int divisionResult = anInt / 0;
            System.out.println(divisionResult); // This won't be printed
        } catch (ArithmeticException e) {
            System.err.println("ArithmeticException caught: " + e.getMessage());
        } catch (Exception e) {
            System.err.println("Generic Exception caught: " + e.getMessage());
        } finally {
            System.out.println("Finally block executed.");
        }
        
        // Lambda expression (Java 8+)
        Runnable myRunnable = () -> System.out.println("Lambda Runnable running");
        new Thread(myRunnable).start();

        // Method reference (Java 8+)
        stringList.forEach(System.out::println);

        // Enum usage
        Day today = Day.WEDNESDAY;
        System.out.println("Today is " + today);
        today.printDayType();

        // Interface implementation
        Shape circle = new Circle(5.0);
        System.out.println("Circle area: " + circle.area());
        System.out.println("Circle perimeter: " + circle.perimeter());
        
        // Anonymous class
        Shape square = new Shape() {
            private double side = 4.0;
            @Override
            public double area() {
                return side * side;
            }
            @Override
            public double perimeter() {
                return 4 * side;
            }
        };
        System.out.println("Square area: " + square.area());

        // Nested class
        OuterClass outer = new OuterClass();
        OuterClass.InnerClass inner = outer.new InnerClass();
        inner.display();
        
        OuterClass.StaticNestedClass staticNested = new OuterClass.StaticNestedClass();
        staticNested.display();

        // Record (Java 14+) - uncomment if using Java 14+
        // Point p = new Point(10, 20);
        // System.out.println("Point: x=" + p.x() + ", y=" + p.y());
    }

    // Instance method
    public void instanceMethod(String param) {
        System.out.println("Instance method called with param: " + param);
        System.out.println("Private field access: " + this.privateField);
    }

    // Static method
    public static int add(int a, int b) {
        return a + b;
    }

    // Method with varargs
    public void printNumbers(int... numbers) {
        System.out.print("Varargs numbers: ");
        for (int num : numbers) {
            System.out.print(num + " ");
        }
        System.out.println();
    }
    
    // Generic method
    public <T> void printArray(T[] inputArray) {
        for(T element : inputArray) {
            System.out.printf("%s ", element);
        }
        System.out.println();
    }
}

// Enum definition
enum Day {
    SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY;

    public void printDayType() {
        switch (this) {
            case SATURDAY:
            case SUNDAY:
                System.out.println("It's a weekend!");
                break;
            default:
                System.out.println("It's a weekday.");
                break;
        }
    }
}

// Interface definition
interface Shape {
    double area(); // abstract method
    double perimeter(); // abstract method

    default void printDescription() { // default method
        System.out.println("This is a shape.");
    }
    
    static void staticMethodInInterface() {
        System.out.println("Static method in Shape interface.");
    }
}

// Class implementing an interface
class Circle implements Shape {
    private double radius;

    public Circle(double radius) {
        this.radius = radius;
    }

    @Override
    public double area() {
        return Math.PI * radius * radius;
    }

    @Override
    public double perimeter() {
        return 2 * Math.PI * radius;
    }
}

// Abstract class
abstract class Vehicle {
    protected String brand;

    public Vehicle(String brand) {
        this.brand = brand;
    }

    public abstract void startEngine(); // abstract method

    public void stopEngine() { // concrete method
        System.out.println("Engine stopped.");
    }
}

class Car extends Vehicle {
    public Car(String brand) {
        super(brand);
    }

    @Override
    public void startEngine() {
        System.out.println(brand + " car engine started.");
    }
}

// Nested and Inner Classes
class OuterClass {
    private int outerField = 10;
    
    class InnerClass { // Non-static nested class (Inner class)
        void display() {
            System.out.println("InnerClass display: outerField = " + outerField);
        }
    }
    
    static class StaticNestedClass { // Static nested class
        void display() {
            // Cannot access outerField directly as it's not static
            System.out.println("StaticNestedClass display.");
        }
    }
}

// Record (Java 14+) - uncomment if using Java 14+
// public record Point(int x, int y) {}

class AnotherClass {
    // Example of using a fully qualified name if there was a name collision
    // java.sql.Date sqlDate; 
    // java.util.Date utilDate;
}
