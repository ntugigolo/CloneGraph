class Datapoint < ActiveRecord::Base
	serialize :datapoint, Array
end
