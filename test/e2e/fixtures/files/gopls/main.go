package main

func Greet(name string) string {
	return "Hello " + name
}

func main() {
	var count int = Greet("world")
	_ = count
}
