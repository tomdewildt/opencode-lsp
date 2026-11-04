package main

import "strings"

func Greet(name string) string {
	strings.ToUpper(name)
	return "Hello " + name
}

func main() {
	_ = Greet("world")
}
