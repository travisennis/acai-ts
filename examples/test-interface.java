// Public interface (must match filename)
public interface TestInterface {
    String getName();
    InternalDetails getDetails();
    void process();
}

// Package-private interface (not public)
interface InternalDetails {
    int getId();
    String getStatus();
}
